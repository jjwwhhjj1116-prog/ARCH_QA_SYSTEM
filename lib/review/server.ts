import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getD1Binding } from '@/db';
import type { Actor, ProjectRole } from '@/lib/domain/contracts';
import { can } from '@/lib/domain/permissions';
import { getPrivateFileStorage } from '@/lib/files/r2-factory';
import { D1SourcePackageRepository } from '@/lib/ingestion/d1-repository';
import { hasUsableStoredSources } from '@/lib/ingestion/document-checklist';
import { RequestBoundaryError } from '@/lib/http/request-boundary';
import {
  mappingSchema,
  profileSchema,
  type Decision,
  type Inspection,
  type ReviewSource,
  type ReviewState,
  type Run,
} from './contracts';
import {
  canonicalRows,
  readWorkbook,
  suggestMapping,
  WorkbookError,
} from './workbook';
import { reviewRows } from './engine';

export const reviewRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('inspect'),
    caseId: z.uuid(),
    sourceVersionId: z.uuid(),
  }),
  z.object({
    action: z.literal('mapping'),
    caseId: z.uuid(),
    baseVersionId: z.uuid().nullable(),
    mappings: z.array(mappingSchema).min(1).max(60),
  }),
  z.object({
    action: z.literal('profile'),
    caseId: z.uuid(),
    profile: profileSchema,
  }),
  z.object({
    action: z.literal('approve'),
    caseId: z.uuid(),
    profileId: z.uuid(),
    trialRunId: z.uuid(),
  }),
  z.object({
    action: z.literal('run'),
    caseId: z.uuid(),
    profileId: z.uuid(),
    trial: z.boolean(),
  }),
  z.object({
    action: z.literal('decision'),
    caseId: z.uuid(),
    runId: z.uuid(),
    findingId: z.string().min(1).max(500),
    disposition: z.enum(['needs_fix', 'normal', 'hold']),
    reason: z.string().trim().min(1).max(1000),
  }),
]);
function fail(status: number, code: string, message: string): never {
  throw new RequestBoundaryError(status, code, message);
}
const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
const sha = async (bytes: ArrayBuffer) =>
  hex(await crypto.subtle.digest('SHA-256', bytes));
export class ReviewService {
  private db = getD1Binding();
  async authorize(
    actor: Actor,
    projectId: string,
    caseId: string,
    write = false,
    approve = false,
  ) {
    z.uuid().parse(projectId);
    z.uuid().parse(caseId);
    const row = await this.db
      .prepare(
        `SELECT pm.role, rc.discipline FROM project_member pm JOIN project p ON p.id=pm.project_id JOIN review_case rc ON rc.project_id=p.id WHERE pm.user_id=? AND p.id=? AND p.status='active' AND rc.id=? AND rc.status<>'archived'`,
      )
      .bind(actor.id, projectId, caseId)
      .first<{ role: string; discipline: string }>();
    if (!row)
      fail(
        403,
        'PROJECT_ACCESS_DENIED',
        '이 프로젝트 자료에 접근할 권한이 없습니다.',
      );
    if (write && !can(row.role as ProjectRole, 'finding:triage'))
      fail(403, 'REVIEW_WRITE_DENIED', '검수 변경 권한이 없습니다.');
    if (
      approve &&
      !['workspace_admin', 'project_owner', 'approver'].includes(row.role)
    )
      fail(
        403,
        'APPROVAL_DENIED',
        '지침 승인은 프로젝트 책임자·승인자만 가능합니다.',
      );
    if (row.discipline !== 'FIN')
      fail(
        409,
        'RC_NOT_IMPLEMENTED',
        '구조팀 검수는 준비 중입니다. 마감팀을 선택해 주세요.',
      );
    return row;
  }
  async sources(
    actor: Actor,
    projectId: string,
    caseId: string,
  ): Promise<ReviewSource[]> {
    const packages = await new D1SourcePackageRepository().listForActor(
      projectId,
      caseId,
      actor.id,
    );
    return packages
      .filter((p) => !p.supersededBy && hasUsableStoredSources(p))
      .flatMap((p) =>
        p.files
          .filter((f) => f.status === 'stored' && f.uploadState === 'finalized')
          .map((f) => ({
            sourceVersionId: f.sourceVersionId,
            sourceFileId: f.sourceFileId,
            filename: f.filename,
            format: f.format,
            packageId: p.id,
          })),
      );
  }
  async state(
    actor: Actor,
    projectId: string,
    caseId: string,
  ): Promise<ReviewState> {
    await this.authorize(actor, projectId, caseId);
    const sources = await this.sources(actor, projectId, caseId);
    const profiles = await this.db
      .prepare(
        `SELECT p.id,p.version,p.profile_json,p.created_at,a.id approval_id,(SELECT id FROM qc_review_run r WHERE r.profile_id=p.id AND r.case_id=? AND r.trial=1 ORDER BY r.created_at DESC LIMIT 1) trial_run_id FROM qc_profile_version p LEFT JOIN qc_profile_approval a ON a.profile_id=p.id WHERE p.project_id=? ORDER BY p.version DESC LIMIT 50`,
      )
      .bind(caseId, projectId)
      .all<{
        id: string;
        version: number;
        profile_json: string;
        created_at: string;
        approval_id: string | null;
        trial_run_id: string | null;
      }>();
    const runs = await this.db
      .prepare(
        `SELECT id,created_at,profile_version,trial,finding_count,row_count FROM qc_review_run WHERE project_id=? AND case_id=? ORDER BY created_at DESC LIMIT 30`,
      )
      .bind(projectId, caseId)
      .all<{
        id: string;
        created_at: string;
        profile_version: number;
        trial: number;
        finding_count: number;
        row_count: number;
      }>();
    const mapping = await this.db
      .prepare(
        `SELECT id,mappings_json FROM qc_mapping_version WHERE project_id=? AND case_id=? ORDER BY rowid DESC LIMIT 1`,
      )
      .bind(projectId, caseId)
      .first<{ id: string; mappings_json: string }>();
    return {
      sources,
      mappingVersionId: mapping?.id ?? null,
      profiles: profiles.results.map((p) => ({
        id: p.id,
        version: p.version,
        status: p.approval_id ? 'active' : 'draft',
        profile: profileSchema.parse(JSON.parse(p.profile_json)),
        createdAt: p.created_at,
        trialRunId: p.trial_run_id,
      })),
      runs: runs.results.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        profileVersion: r.profile_version,
        trial: !!r.trial,
        findingCount: r.finding_count,
        rowCount: r.row_count,
      })),
      mappings: mapping
        ? z
            .array(mappingSchema)
            .parse(JSON.parse(mapping.mappings_json))
            .filter((m) =>
              sources.some((s) => s.sourceVersionId === m.sourceVersionId),
            )
        : [],
    };
  }
  private async readSource(
    projectId: string,
    caseId: string,
    source: ReviewSource,
  ) {
    const stored = await getPrivateFileStorage().getSourceFile({
      projectId,
      caseId,
      sourceVersionId: source.sourceVersionId,
      fileId: source.sourceFileId,
      extension: source.format,
    });
    if (!stored)
      fail(404, 'SOURCE_NOT_FOUND', '저장된 원본을 찾지 못했습니다.');
    if (stored.size > 8 * 1024 * 1024)
      throw new WorkbookError(
        '현재 내용 검수 한도는 파일당 8MB입니다. 저장된 원본은 보존되며 파일 분할이 필요합니다.',
      );
    const bytes = await new Response(stored.body).arrayBuffer();
    if (
      bytes.byteLength !== stored.size ||
      (await sha(bytes)) !== stored.sha256
    )
      fail(
        409,
        'SOURCE_INTEGRITY',
        '원본 해시 또는 크기가 일치하지 않습니다. 검수를 중단했습니다.',
      );
    return {
      sheets: readWorkbook(new Uint8Array(bytes), source.format),
      sha256: stored.sha256,
    };
  }
  async inspect(
    actor: Actor,
    projectId: string,
    caseId: string,
    sourceVersionId: string,
  ): Promise<Inspection> {
    const sources = await this.sources(actor, projectId, caseId);
    const source = sources.find((s) => s.sourceVersionId === sourceVersionId);
    if (!source)
      fail(
        404,
        'SOURCE_NOT_FOUND',
        '현재 자료 버전에 포함된 파일을 선택해 주세요.',
      );
    const { sheets, sha256 } = await this.readSource(projectId, caseId, source);
    return {
      source,
      sha256,
      sheets: sheets.map((sheet) => {
        const suggested = suggestMapping(
          sheet,
          sourceVersionId,
          source.filename,
        );
        return {
          name: sheet.name,
          rowCount: sheet.rows.length,
          preview: sheet.rows.slice(0, Math.min(100, suggested.headerRow + 16)),
          suggested,
        };
      }),
    };
  }
  private async write(
    actor: Actor,
    projectId: string,
    caseId: string,
    id: string,
    action: string,
    statement: D1PreparedStatement,
    requestId: string,
    approval = false,
  ) {
    // Check immediately before the atomic batch, not only when a button is rendered.
    await this.authorize(actor, projectId, caseId, true, approval);
    await this.db.batch([
      statement,
      this.db
        .prepare(
          `INSERT INTO audit_event (id,project_id,actor_id,action,target_type,target_id,payload_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          crypto.randomUUID(),
          projectId,
          actor.id,
          action,
          'qc_review',
          id,
          JSON.stringify({ caseId }),
          requestId,
          Date.now(),
        ),
    ]);
  }
  async runDetail(
    actor: Actor,
    projectId: string,
    caseId: string,
    runId: string,
  ): Promise<{ run: Run; decisions: Decision[] }> {
    await this.authorize(actor, projectId, caseId);
    z.uuid().parse(runId);
    const record = await this.db
      .prepare(
        'SELECT object_key,sha256 FROM qc_review_run WHERE id=? AND project_id=? AND case_id=?',
      )
      .bind(runId, projectId, caseId)
      .first<{ object_key: string; sha256: string }>();
    if (!record || !env.FILES)
      fail(404, 'RUN_NOT_FOUND', '저장된 검수 실행을 찾지 못했습니다.');
    const object = await env.FILES.get(record.object_key);
    if (!object || object.size > 24 * 1024 * 1024)
      fail(409, 'RUN_UNAVAILABLE', '검수 근거 파일을 읽을 수 없습니다.');
    const bytes = await object.arrayBuffer();
    if ((await sha(bytes)) !== record.sha256)
      fail(409, 'RUN_INTEGRITY', '검수 근거 해시가 일치하지 않습니다.');
    const run = JSON.parse(new TextDecoder().decode(bytes)) as Run;
    if (
      run.projectId !== projectId ||
      run.caseId !== caseId ||
      run.id !== runId
    )
      fail(409, 'RUN_SCOPE', '검수 근거 범위가 일치하지 않습니다.');
    const decisions = await this.db
      .prepare(
        'SELECT id,finding_id,disposition,reason,actor_id,created_at FROM qc_review_decision WHERE project_id=? AND run_id=? ORDER BY created_at ASC,id ASC',
      )
      .bind(projectId, runId)
      .all<{
        id: string;
        finding_id: string;
        disposition: Decision['disposition'];
        reason: string;
        actor_id: string;
        created_at: string;
      }>();
    return {
      run,
      decisions: decisions.results.map((d) => ({
        id: d.id,
        findingId: d.finding_id,
        disposition: d.disposition,
        reason: d.reason,
        actorId: d.actor_id,
        createdAt: d.created_at,
      })),
    };
  }
  async mutate(
    actor: Actor,
    projectId: string,
    input: z.infer<typeof reviewRequestSchema>,
    requestId: string,
  ): Promise<unknown> {
    const { caseId } = input;
    const member = await this.authorize(
      actor,
      projectId,
      caseId,
      input.action !== 'inspect',
      input.action === 'approve',
    );
    if (
      ['mapping', 'profile', 'run'].includes(input.action) &&
      !can(member.role as ProjectRole, 'review:run')
    )
      fail(403, 'REVIEW_RUN_DENIED', '매핑·지침 작성·실행 권한이 없습니다.');
    if (input.action === 'inspect')
      return this.inspect(actor, projectId, caseId, input.sourceVersionId);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    if (input.action === 'mapping') {
      const currentMapping = await this.db
        .prepare(
          'SELECT id FROM qc_mapping_version WHERE project_id=? AND case_id=? ORDER BY rowid DESC LIMIT 1',
        )
        .bind(projectId, caseId)
        .first<{ id: string }>();
      if ((currentMapping?.id ?? null) !== input.baseVersionId)
        fail(
          409,
          'MAPPING_CONFLICT',
          '다른 화면에서 매핑이 변경되었습니다. 새로 확인한 뒤 다시 저장해 주세요.',
        );
      const sources = await this.sources(actor, projectId, caseId);
      if (
        input.mappings.some(
          (m) => !sources.some((s) => s.sourceVersionId === m.sourceVersionId),
        )
      )
        fail(
          409,
          'MAPPING_SOURCE_CHANGED',
          '원본 버전이 변경되었습니다. 다시 확인해 주세요.',
        );
      const keys = input.mappings.map((m) => m.sourceVersionId + ':' + m.sheet);
      if (new Set(keys).size !== keys.length)
        fail(
          400,
          'DUPLICATE_MAPPING',
          '시트당 하나의 매핑만 저장할 수 있습니다.',
        );
      await this.write(
        actor,
        projectId,
        caseId,
        id,
        'review.mapping.saved',
        this.db
          .prepare('INSERT INTO qc_mapping_version VALUES (?,?,?,?,?,?,?)')
          .bind(
            id,
            projectId,
            caseId,
            JSON.stringify(input.mappings),
            actor.id,
            createdAt,
            input.baseVersionId ?? 'initial',
          ),
        requestId,
      );
      return { id };
    }
    if (input.action === 'profile') {
      await this.write(
        actor,
        projectId,
        caseId,
        id,
        'review.profile.drafted',
        this.db
          .prepare(
            'INSERT INTO qc_profile_version SELECT ?,?,COALESCE(MAX(version),0)+1,?,?,? FROM qc_profile_version WHERE project_id=?',
          )
          .bind(
            id,
            projectId,
            JSON.stringify(input.profile),
            actor.id,
            createdAt,
            projectId,
          ),
        requestId,
      );
      return { id };
    }
    if (input.action === 'approve') {
      const trial = await this.db
        .prepare(
          'SELECT id FROM qc_review_run WHERE id=? AND project_id=? AND case_id=? AND profile_id=? AND trial=1',
        )
        .bind(input.trialRunId, projectId, caseId, input.profileId)
        .first();
      if (!trial)
        fail(
          409,
          'TRIAL_REQUIRED',
          '같은 지침 버전으로 시험 검수를 먼저 실행해 주세요.',
        );
      const { run: trialResult } = await this.runDetail(
        actor,
        projectId,
        caseId,
        input.trialRunId,
      );
      if (!trialResult.coverage.some((c) => c.evaluated > 0))
        fail(
          409,
          'EMPTY_TRIAL',
          '실제로 평가한 항목이 없는 시험은 승인할 수 없습니다. 매핑과 필요한 자료를 확인해 주세요.',
        );
      await this.write(
        actor,
        projectId,
        caseId,
        input.profileId,
        'review.profile.approved',
        this.db
          .prepare('INSERT INTO qc_profile_approval VALUES (?,?,?,?,?,?)')
          .bind(
            id,
            projectId,
            input.profileId,
            input.trialRunId,
            actor.id,
            createdAt,
          ),
        requestId,
        true,
      );
      return { id: input.profileId };
    }
    if (input.action === 'decision') {
      const { run } = await this.runDetail(
        actor,
        projectId,
        caseId,
        input.runId,
      );
      if (run.trial)
        fail(
          409,
          'TRIAL_DECISION',
          '시험 결과입니다. 지침 승인 후 정식 검수에서 판단을 기록해 주세요.',
        );
      if (!run.findings.some((f) => f.id === input.findingId))
        fail(404, 'FINDING_NOT_FOUND', '해당 실행에 없는 검수 항목입니다.');
      await this.write(
        actor,
        projectId,
        caseId,
        id,
        'review.decision.recorded',
        this.db
          .prepare('INSERT INTO qc_review_decision VALUES (?,?,?,?,?,?,?,?)')
          .bind(
            id,
            projectId,
            input.runId,
            input.findingId,
            input.disposition,
            input.reason,
            actor.id,
            createdAt,
          ),
        requestId,
      );
      return { id };
    }
    const state = await this.state(actor, projectId, caseId);
    const profile = state.profiles.find((p) => p.id === input.profileId);
    if (!profile) fail(404, 'PROFILE_NOT_FOUND', '지침 버전을 선택해 주세요.');
    if (!input.trial && profile.status !== 'active')
      fail(
        409,
        'PROFILE_NOT_APPROVED',
        '시험 실행과 지침 승인 후 정식 검수가 가능합니다.',
      );
    const mappings = state.mappings.filter((m) => m.confirmed);
    if (!mappings.length)
      fail(
        409,
        'NEEDS_MAPPING',
        '자료 구조에서 하나 이상의 시트·열 의미를 확인해 주세요.',
      );
    const rows: Run['rows'] = [];
    let evidenceBytes = 0;
    const refs: Run['sources'] = [];
    const limitations: string[] = [];
    const seenHashes = new Set<string>();
    for (const source of state.sources) {
      const selected = mappings.filter(
        (m) => m.sourceVersionId === source.sourceVersionId,
      );
      if (!selected.length) {
        limitations.push(`${source.filename}: 시트·열 매핑 미확인`);
        continue;
      }
      try {
        const parsed = await this.readSource(projectId, caseId, source);
        if (seenHashes.has(parsed.sha256)) {
          limitations.push(
            `${source.filename}: 동일 해시 파일의 중복 표본 제외`,
          );
          continue;
        }
        seenHashes.add(parsed.sha256);
        for (const mapping of selected) {
          const sheet = parsed.sheets.find((s) => s.name === mapping.sheet);
          if (!sheet) {
            limitations.push(`${source.filename}/${mapping.sheet}: 시트 없음`);
            continue;
          }
          const ref = {
            sourceVersionId: source.sourceVersionId,
            filename: source.filename,
            sha256: parsed.sha256,
            sheet: sheet.name,
            row: mapping.headerRow,
            cell: 'A' + mapping.headerRow,
          };
          refs.push(ref);
          for (const row of canonicalRows(sheet, mapping, ref)) {
            evidenceBytes += new TextEncoder().encode(
              JSON.stringify(row),
            ).byteLength;
            if (evidenceBytes > 10 * 1024 * 1024)
              fail(
                413,
                'REVIEW_EVIDENCE_LIMIT',
                '원본 근거를 펼친 크기가 검수 한도를 넘었습니다. 자료를 나눠 주세요.',
              );
            rows.push(row);
          }
          if (rows.length > 20000)
            fail(
              413,
              'REVIEW_ROW_LIMIT',
              '실행당 20,000행 한도를 넘었습니다. 검수 자료를 나눠 주세요.',
            );
        }
      } catch (error) {
        if (error instanceof WorkbookError)
          limitations.push(`${source.filename}: ${error.message}`);
        else throw error;
      }
    }
    if (!rows.length)
      fail(
        409,
        'NO_REVIEWABLE_ROWS',
        '검수할 행을 읽지 못했습니다. 시트와 머리글·열 매핑을 확인해 주세요.',
      );
    const result = reviewRows(rows, profile.profile);
    const run: Run = {
      id,
      projectId,
      caseId,
      actorId: actor.id,
      createdAt,
      profileId: profile.id,
      profileVersion: profile.version,
      trial: input.trial,
      profile: profile.profile,
      mappings,
      rows,
      sources: refs,
      ...result,
      limitations: [...limitations, ...result.limitations],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(run));
    if (bytes.byteLength > 24 * 1024 * 1024)
      fail(
        413,
        'REVIEW_EVIDENCE_LIMIT',
        '검수 근거 저장 한도를 넘었습니다. 자료를 나눠 주세요.',
      );
    if (!env.FILES)
      fail(
        503,
        'REVIEW_STORAGE_UNAVAILABLE',
        '검수 근거 저장소가 연결되지 않았습니다.',
      );
    const objectKey = `projects/${projectId}/cases/${caseId}/reviews/${id}.json`;
    const digest = await sha(bytes.buffer);
    await env.FILES.put(objectKey, bytes, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { projectId, caseId, sha256: digest },
    });
    await this.write(
      actor,
      projectId,
      caseId,
      id,
      'review.run.completed',
      this.db
        .prepare('INSERT INTO qc_review_run VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(
          id,
          projectId,
          caseId,
          profile.id,
          profile.version,
          input.trial ? 1 : 0,
          objectKey,
          digest,
          run.findings.length,
          rows.length,
          actor.id,
          createdAt,
        ),
      requestId,
    );
    return { run, decisions: [] };
  }
}
