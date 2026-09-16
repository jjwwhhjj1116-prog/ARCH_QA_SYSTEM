import { reviewStorage } from '@/lib/files/review-storage';
import { z } from 'zod';
import { getD1Binding } from '@/db';
import type { Actor, ProjectRole } from '@/lib/domain/contracts';
import { can } from '@/lib/domain/permissions';
import { isApplicationAdmin } from '@/lib/auth/administrators';
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
import { inScope, reviewRows } from './engine';
import { BaselineService, basicStatus } from './baseline-server';
import { unpackEvidence } from './baseline';
import { getCompanyGeminiConfig } from '@/lib/server/ai/company-settings';
import { reviewWithGemini } from './gemini-review';
import { applyAiProgress } from './ai-progress';
import { regionalGeminiFetch } from '@/lib/server/ai/regional-fetch';
import { PersonalSettingsError } from '@/lib/server/ai/personal-settings';
import { DriveTransferService } from '@/lib/ingestion/drive-transfer-service';
import { exportReview } from './report';
import { AiRecoveryStore, type RecoveryRecord } from './ai-recovery';

export const reviewRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('resume-ai-save'),
    caseId: z.uuid(),
    requestKey: z.uuid(),
  }),
  z.object({
    action: z.literal('save-report'),
    caseId: z.uuid(),
    runId: z.uuid(),
  }),
  z.object({
    action: z.literal('prepare-source'),
    caseId: z.uuid(),
    uploadId: z.uuid(),
  }),
  z.object({
    action: z.literal('start-basic'),
    caseId: z.uuid(),
    requestKey: z.uuid(),
  }),
  z.object({
    action: z.literal('continue-basic'),
    caseId: z.uuid(),
    jobId: z.uuid(),
  }),
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
    includeAi: z.boolean().optional(),
    parentRunId: z.uuid().optional(),
    requestKey: z.uuid().optional(),
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
  constructor(
    private recovery?: AiRecoveryStore,
    private aiFetcher: typeof fetch = regionalGeminiFetch,
  ) {}
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
    if (approve && !isApplicationAdmin(actor.email))
      fail(
        403,
        'APPROVAL_DENIED',
        '지침 설정·시험·활성화는 관리자만 가능합니다.',
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
    const admin = isApplicationAdmin(actor.email);
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
    const basicRuns = await this.db
      .prepare(
        `SELECT id,created_at,finding_count,row_count FROM qc_basic_run WHERE project_id=? AND case_id=? ORDER BY created_at DESC LIMIT 30`,
      )
      .bind(projectId, caseId)
      .all<{
        id: string;
        created_at: string;
        finding_count: number;
        row_count: number;
      }>();
    const pending = await this.db
      .prepare(
        `SELECT * FROM qc_basic_job WHERE project_id=? AND case_id=? AND actor_id=? AND state='running' ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(projectId, caseId, actor.id)
      .first<Parameters<typeof basicStatus>[0]>();
    return {
      sources,
      pendingAiSaves: (await this.recovery?.pending(actor.id, caseId)) ?? [],
      canManageGuidelines: admin,
      pendingJob: pending ? basicStatus(pending) : null,
      mappingVersionId: mapping?.id ?? null,
      profiles: profiles.results
        .filter((p) => admin || p.approval_id)
        .map((p) => ({
          id: p.id,
          version: p.version,
          status: p.approval_id ? 'active' : 'draft',
          profile: profileSchema.parse(JSON.parse(p.profile_json)),
          createdAt: p.created_at,
          trialRunId: admin ? p.trial_run_id : null,
        })),
      runs: [
        ...runs.results
          .filter((r) => admin || !r.trial)
          .map((r) => ({
            id: r.id,
            createdAt: r.created_at,
            profileVersion: r.profile_version,
            trial: !!r.trial,
            findingCount: r.finding_count,
            rowCount: r.row_count,
          })),
        ...basicRuns.results.map((r) => ({
          id: r.id,
          createdAt: r.created_at,
          profileVersion: 1,
          trial: false,
          kind: 'baseline' as const,
          findingCount: r.finding_count,
          rowCount: r.row_count,
        })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
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
  async readSource(projectId: string, caseId: string, source: ReviewSource) {
    const stored = await getPrivateFileStorage().getSourceFile({
      projectId,
      caseId,
      sourceVersionId: source.sourceVersionId,
      fileId: source.sourceFileId,
      extension: source.format,
    });
    if (!stored)
      fail(404, 'SOURCE_NOT_FOUND', '저장된 원본을 찾지 못했습니다.');
    if (stored.size > 20 * 1024 * 1024)
      throw new WorkbookError(
        '파일당 검수 한도 20MB를 넘었습니다. 저장된 원본은 보존됩니다.',
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
    const legacyRecord = await this.db
      .prepare(
        'SELECT object_key,sha256,trial FROM qc_review_run WHERE id=? AND project_id=? AND case_id=?',
      )
      .bind(runId, projectId, caseId)
      .first<{ object_key: string; sha256: string; trial: number }>();
    const basicRecord = legacyRecord
      ? null
      : await this.db
          .prepare(
            'SELECT object_key,sha256 FROM qc_basic_run WHERE id=? AND project_id=? AND case_id=?',
          )
          .bind(runId, projectId, caseId)
          .first<{ object_key: string; sha256: string }>();
    const record =
      legacyRecord ?? (basicRecord ? { ...basicRecord, trial: 0 } : null);
    if (!record)
      fail(404, 'RUN_NOT_FOUND', '저장된 검수 실행을 찾지 못했습니다.');
    if (record.trial && !isApplicationAdmin(actor.email))
      fail(
        403,
        'RULE_ADMIN_REQUIRED',
        '지침 시험 결과는 관리자만 확인할 수 있습니다.',
      );
    const object = await reviewStorage().get(record.object_key);
    if (!object || object.size > 24 * 1024 * 1024)
      fail(409, 'RUN_UNAVAILABLE', '검수 근거 파일을 읽을 수 없습니다.');
    const bytes = await object.arrayBuffer();
    if ((await sha(bytes)) !== record.sha256)
      fail(409, 'RUN_INTEGRITY', '검수 근거 해시가 일치하지 않습니다.');
    const run = unpackEvidence<Run>(
      JSON.parse(new TextDecoder().decode(bytes)),
    );
    if (
      run.projectId !== projectId ||
      run.caseId !== caseId ||
      run.id !== runId
    )
      fail(409, 'RUN_SCOPE', '검수 근거 범위가 일치하지 않습니다.');
    const decisions = await this.db
      .prepare(
        `SELECT id,finding_id,disposition,reason,actor_id,created_at FROM ${basicRecord ? 'qc_basic_decision' : 'qc_review_decision'} WHERE project_id=? AND run_id=? ORDER BY created_at ASC,id ASC`,
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
      input.action === 'approve' ||
        input.action === 'profile' ||
        (input.action === 'run' && input.trial),
    );
    if (input.action === 'resume-ai-save') {
      if (!this.recovery)
        fail(
          503,
          'AI_RECOVERY_UNAVAILABLE',
          'AI 복구 저장소가 연결되지 않았습니다.',
        );
      const record = await this.recovery.get(
        actor.id,
        caseId,
        input.requestKey,
      );
      if (!record || record.projectId !== projectId)
        fail(
          404,
          'AI_RECOVERY_NOT_FOUND',
          '이 계정의 AI 복구 요청을 찾지 못했습니다.',
        );
      if (record.state === 'completed')
        return this.runDetail(actor, projectId, caseId, record.runId);
      const run = await this.recovery.read(record);
      await this.persistRun(actor, run, requestId);
      await this.recovery.complete(record);
      return this.runDetail(actor, projectId, caseId, run.id);
    }
    if (input.action === 'run' && input.includeAi) {
      if (
        !this.recovery &&
        process.env.FILE_STORAGE_PROVIDER === 'google-drive'
      )
        fail(
          503,
          'AI_RECOVERY_UNAVAILABLE',
          'AI 결과 복구 저장소가 연결되지 않았습니다. AI를 호출하지 않았습니다.',
        );
      const previous = input.requestKey
        ? await this.recovery?.get(actor.id, caseId, input.requestKey)
        : undefined;
      if (previous) {
        if (
          previous.projectId !== projectId ||
          previous.fingerprint !== JSON.stringify(input)
        )
          fail(
            409,
            'AI_REQUEST_CONFLICT',
            '동일 AI 요청 ID에 다른 입력을 사용할 수 없습니다.',
          );
        if (previous.state === 'completed')
          return this.runDetail(actor, projectId, caseId, previous.runId);
        fail(
          409,
          previous.state === 'ready'
            ? 'AI_RESULT_SAVE_PENDING'
            : 'AI_RESULT_UNCERTAIN',
          previous.state === 'ready'
            ? 'AI 결과가 보관되어 있습니다. AI 재실행 없이 결과 저장을 복구해 주세요.'
            : '이미 접수된 AI 요청입니다. 응답 저장 여부를 확인할 수 없어 자동 재호출하지 않습니다.',
        );
      }
    }
    if (input.action === 'prepare-source') {
      const scoped = await this.db
        .prepare(
          'SELECT id FROM upload_attempt WHERE id=? AND project_id=? AND review_case_id=?',
        )
        .bind(input.uploadId, projectId, caseId)
        .first();
      if (!scoped)
        fail(403, 'PROJECT_ACCESS_DENIED', '이 프로젝트의 원본이 아닙니다.');
      return new DriveTransferService(
        this.db,
        process.env.AI_SETTINGS_ENCRYPTION_KEY,
      ).prepare(input.uploadId, actor, requestId);
    }
    if (input.action === 'save-report') {
      const { run, decisions } = await this.runDetail(
        actor,
        projectId,
        caseId,
        input.runId,
      );
      const bytes = new Uint8Array(exportReview(run, decisions));
      const digest = await sha(bytes.buffer);
      const objectKey = `projects/${projectId}/cases/${caseId}/reviews/${run.id}/report-${digest}.xlsx`;
      await this.authorize(actor, projectId, caseId, true, run.trial);
      await reviewStorage().put(objectKey, bytes, {
        httpMetadata: {
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        customMetadata: { projectId, caseId, sha256: digest },
      });
      await this.authorize(actor, projectId, caseId, true, run.trial);
      const audit = await this.db
        .prepare(
          `INSERT INTO audit_event(id,project_id,actor_id,action,target_type,target_id,payload_json,request_id,created_at)
         SELECT ?,?,?,'review.report.saved','qc_review',?,?,?,?
         WHERE EXISTS(SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id JOIN review_case rc ON rc.project_id=p.id
           WHERE pm.user_id=? AND p.id=? AND p.status='active' AND rc.id=? AND rc.status<>'archived'
           AND pm.role IN ('workspace_admin','project_owner','reviewer','approver')
           AND NOT EXISTS(SELECT 1 FROM employee_account e WHERE e.id=pm.user_id AND e.active=0))`,
        )
        .bind(
          crypto.randomUUID(),
          projectId,
          actor.id,
          run.id,
          JSON.stringify({
            caseId,
            objectKey,
            sha256: digest,
            size: bytes.byteLength,
            decisionCount: decisions.length,
            trial: run.trial,
          }),
          crypto.randomUUID(),
          Date.now(),
          actor.id,
          projectId,
          caseId,
        )
        .run();
      if (audit.meta.changes !== 1)
        fail(
          403,
          'QC_PERMISSION_CHANGED',
          '저장 중 권한이 변경되었습니다. 프로젝트 접근 권한을 확인해 주세요.',
        );
      return {
        runId: run.id,
        objectKey,
        sha256: digest,
        size: bytes.byteLength,
        saved: true,
        format: 'xlsx',
        decisionCount: decisions.length,
      };
    }
    if (
      ['mapping', 'profile', 'run', 'start-basic', 'continue-basic'].includes(
        input.action,
      ) &&
      !can(member.role as ProjectRole, 'review:run')
    )
      fail(403, 'REVIEW_RUN_DENIED', '매핑·지침 작성·실행 권한이 없습니다.');
    if (input.action === 'inspect')
      return this.inspect(actor, projectId, caseId, input.sourceVersionId);
    if (input.action === 'start-basic')
      return new BaselineService(this).start(
        actor,
        projectId,
        caseId,
        input.requestKey,
      );
    if (input.action === 'continue-basic')
      return new BaselineService(this).continue(
        actor,
        projectId,
        caseId,
        input.jobId,
        requestId,
      );
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
        true,
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
      const untestedAi = trialResult.profile.instructions?.some(
        (i) =>
          i.enabled &&
          !trialResult.coverage.some(
            (c) => c.ruleId === `AI-${i.id}` && c.evaluated > 0,
          ),
      );
      if (untestedAi)
        fail(
          409,
          'AI_TRIAL_REQUIRED',
          '활성 AI 지침마다 AI 시험 평가가 필요합니다. AI 지침 적용을 켜고 시험하거나 해당 지침을 비활성화하여 새 버전을 저장하세요.',
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
          .prepare(
            `INSERT INTO ${run.kind === 'baseline' ? 'qc_basic_decision' : 'qc_review_decision'} VALUES (?,?,?,?,?,?,?,?)`,
          )
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
    if (
      input.includeAi &&
      (!input.requestKey ||
        !profile.profile.instructions?.some((i) => i.enabled))
    )
      fail(
        400,
        'AI_INSTRUCTIONS_REQUIRED',
        '저장된 활성 AI 지침과 실행 요청 ID가 필요합니다.',
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
    const packages = await new D1SourcePackageRepository().listForActor(
      projectId,
      caseId,
      actor.id,
    );
    const registered = packages
      .filter((p) => !p.supersededBy)
      .flatMap((p) => p.files);
    const sourceAudit: NonNullable<Run['sourceAudit']> = {
      registeredFiles: registered.length,
      inspectedFiles: 0,
      totalSheets: 0,
      mappedSheets: 0,
      issues: [],
    };
    for (const file of registered) {
      if (
        !state.sources.some((s) => s.sourceVersionId === file.sourceVersionId)
      )
        sourceAudit.issues.push(
          `${file.filename}: 등록 원본의 저장·검수 준비 미완료`,
        );
    }
    if (registered.length !== state.sources.length)
      sourceAudit.issues.push('등록 목록과 검수 원본 목록의 파일 수 불일치');
    const seenHashes = new Set<string>();
    for (const source of state.sources) {
      const selected = mappings.filter(
        (m) => m.sourceVersionId === source.sourceVersionId,
      );
      if (!selected.length) {
        limitations.push(`${source.filename}: 시트·열 매핑 미확인`);
        sourceAudit.issues.push(`${source.filename}: 시트·열 매핑 미확인`);
      }
      try {
        const parsed = await this.readSource(projectId, caseId, source);
        sourceAudit.inspectedFiles++;
        sourceAudit.totalSheets += parsed.sheets.length;
        for (const sheet of parsed.sheets) {
          if (!selected.some((m) => m.sheet === sheet.name))
            sourceAudit.issues.push(
              `${source.filename}/${sheet.name}: 미매핑 시트`,
            );
        }
        if (seenHashes.has(parsed.sha256)) {
          sourceAudit.issues.push(
            `${source.filename}: 동일 해시 중복 제외 · 범위 확인 필요`,
          );
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
            sourceAudit.issues.push(
              `${source.filename}/${mapping.sheet}: 시트 없음`,
            );
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
          sourceAudit.mappedSheets++;
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
        if (error instanceof WorkbookError) {
          limitations.push(`${source.filename}: ${error.message}`);
          sourceAudit.issues.push(`${source.filename}: 원본 읽기 실패`);
        } else throw error;
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
      sourceAudit,
      ...result,
      limitations: [...limitations, ...result.limitations],
    };
    const instructions =
      profile.profile.instructions?.filter((i) => i.enabled) ?? [];
    let parent: Run | undefined;
    if (input.parentRunId) {
      parent = (
        await this.runDetail(actor, projectId, caseId, input.parentRunId)
      ).run;
      if (
        !input.includeAi ||
        !parent.aiChecks ||
        !parent.ai ||
        parent.profileId !== run.profileId ||
        parent.trial !== run.trial ||
        JSON.stringify(parent.rows) !== JSON.stringify(run.rows) ||
        JSON.stringify(parent.mappings) !== JSON.stringify(run.mappings) ||
        JSON.stringify(parent.profile) !== JSON.stringify(run.profile)
      )
        fail(
          409,
          'AI_CONTINUATION_CHANGED',
          '원본·매핑·지침 또는 실행 범위가 바뀌어 이어갈 수 없습니다. 새 검수가 필요합니다.',
        );
      if (
        !parent.sourceAudit ||
        !run.sourceAudit ||
        parent.sourceAudit.registeredFiles !==
          run.sourceAudit.registeredFiles ||
        parent.sourceAudit.totalSheets !== run.sourceAudit.totalSheets ||
        JSON.stringify(parent.sources) !== JSON.stringify(run.sources)
      )
        fail(
          409,
          'AI_CONTINUATION_CHANGED',
          '등록 파일·시트 목록이 바뀌었습니다. 새 전체 검수가 필요합니다.',
        );
      if (!parent.aiChecks.some((c) => c.status === 'pending'))
        fail(
          409,
          'AI_NO_PENDING_ROWS',
          '미전송 대상이 없습니다. 실패·판단불가 항목은 별도 확인이 필요합니다.',
        );
    }
    let recoveryRecord: RecoveryRecord | undefined;
    if (input.includeAi) {
      // Only a project-authorized command can use the company key. D1 claims
      // prevent duplicate paid requests; history remains accessible after a lost response.
      const config = await getCompanyGeminiConfig(
        this.db,
        process.env.AI_SETTINGS_ENCRYPTION_KEY,
      ).catch((error: unknown) => {
        if (error instanceof PersonalSettingsError)
          fail(error.status, error.code, error.message);
        throw error;
      });
      const now = Date.now();
      if (parent) {
        if (
          parent.ai?.settingsVersion !== config.version ||
          parent.ai.model !== config.model
        )
          fail(
            409,
            'AI_CONTINUATION_CHANGED',
            '회사 키·모델 설정이 바뀌었습니다. 기존 실행과 합치지 않습니다.',
          );
      }
      const claim = await this.db
        .prepare(
          'INSERT OR IGNORE INTO auth_attempt(bucket,attempts,expires_at) VALUES (?,1,?) RETURNING attempts',
        )
        .bind(`ai-request:${actor.id}:${input.requestKey}`, now + 24 * 3600_000)
        .first();
      if (!claim)
        fail(
          409,
          'AI_REQUEST_ALREADY_STARTED',
          '이미 접수된 AI 요청입니다. 실행 이력을 확인하세요. 자동 재과금하지 않습니다.',
        );
      const counter = await this.db
        .prepare(
          'INSERT INTO auth_attempt(bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING attempts',
        )
        .bind(
          'qc-company-ai-budget',
          now + 15 * 60_000,
          now,
          now,
          now + 15 * 60_000,
        )
        .first<{ attempts: number }>();
      if (!counter || counter.attempts > 10)
        fail(
          429,
          'AI_RATE_LIMIT',
          '회사 AI 검수는 15분에 최대 10회입니다. 잠시 뒤 다시 시도하세요.',
        );
      await this.authorize(actor, projectId, caseId, true, input.trial);
      if (parent) {
        const continuation = await this.db
          .prepare(
            'INSERT OR IGNORE INTO auth_attempt(bucket,attempts,expires_at) VALUES (?,1,?) RETURNING attempts',
          )
          .bind(`ai-continuation:${parent.id}`, now + 24 * 3600_000)
          .first();
        if (!continuation)
          fail(
            409,
            'AI_CONTINUATION_STARTED',
            '이 묶음의 다음 실행이 이미 접수됐습니다. 실행 이력·저장 복구를 확인하세요.',
          );
      }
      if (this.recovery) {
        recoveryRecord = {
          actorId: actor.id,
          projectId,
          caseId,
          requestKey: input.requestKey!,
          runId: id,
          fingerprint: JSON.stringify(input),
          state: 'claimed',
        };
        try {
          await this.recovery.claim(recoveryRecord);
        } catch (error) {
          // No Google call has happened yet; release only this owned continuation.
          if (parent)
            await this.db
              .prepare('DELETE FROM auth_attempt WHERE bucket=?')
              .bind(`ai-continuation:${parent.id}`)
              .run();
          throw error;
        }
      }
      const pendingRowIds = parent
        ? new Set(
            parent
              .aiChecks!.filter((c) => c.status === 'pending')
              .map((c) => c.rowId),
          )
        : null;
      const aiResult = await reviewWithGemini({
        fetcher: this.aiFetcher,
        apiKey: config.apiKey,
        model: config.model,
        contextRows: rows.map((row) =>
          inScope(row, profile.profile)
            ? row
            : { ...row, excluded: '지침 대상 조건 또는 예외에 따라 제외' },
        ),
        rows: rows
          .filter((row) => !pendingRowIds || pendingRowIds.has(row.id))
          .map((row) =>
            inScope(row, profile.profile)
              ? row
              : { ...row, excluded: '지침 대상 조건 또는 예외에 따라 제외' },
          ),
        instructions,
      });
      run.ai = { ...aiResult.ai, settingsVersion: config.version };
      run.findings.push(...aiResult.findings);
      run.coverage.push(...aiResult.coverage);
      run.limitations.push(...aiResult.limitations);
      applyAiProgress(run, aiResult, parent);
    } else if (instructions.length) {
      run.limitations.push(
        '이번 실행은 외부 AI 미사용입니다. 자연어 AI 지침은 검사하지 않았습니다.',
      );
      run.coverage.push(
        ...instructions.map((i) => ({
          ruleId: `AI-${i.id}`,
          label: i.text,
          evaluated: 0,
          unevaluated: rows.length,
          reasons: ['외부 AI 미사용 실행'],
        })),
      );
    }
    if (recoveryRecord && this.recovery)
      await this.recovery.checkpoint(recoveryRecord, run);
    try {
      await this.persistRun(actor, run, requestId);
      if (recoveryRecord && this.recovery)
        await this.recovery.complete(recoveryRecord);
    } catch (error) {
      if (
        recoveryRecord &&
        !(error instanceof RequestBoundaryError && error.status === 403)
      )
        fail(
          503,
          'AI_RESULT_SAVE_PENDING',
          'AI 결과는 복구 저장소에 보관되어 있습니다. AI 재호출 없이 결과 저장을 다시 진행해 주세요.',
        );
      throw error;
    }
    return { run, decisions: [] };
  }
  private async persistRun(actor: Actor, run: Run, requestId: string) {
    const { projectId, caseId, id } = run;
    await this.authorize(actor, projectId, caseId, true, run.trial);
    const bytes = new TextEncoder().encode(JSON.stringify(run));
    if (bytes.byteLength > 24 * 1024 * 1024)
      fail(
        413,
        'REVIEW_EVIDENCE_LIMIT',
        '검수 근거 저장 한도를 넘었습니다. 자료를 나눠 주세요.',
      );
    const objectKey = `projects/${projectId}/cases/${caseId}/reviews/${id}.json`;
    const digest = await sha(bytes.buffer);
    const existing = await this.db
      .prepare(
        'SELECT sha256 FROM qc_review_run WHERE id=? AND project_id=? AND case_id=?',
      )
      .bind(id, projectId, caseId)
      .first<{ sha256: string }>();
    if (existing) {
      if (existing.sha256 !== digest)
        fail(
          409,
          'AI_RECOVERY_INTEGRITY',
          '이미 저장된 실행의 해시가 다릅니다.',
        );
      return;
    }
    await reviewStorage().put(objectKey, bytes, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { projectId, caseId, sha256: digest },
    });
    await this.authorize(actor, projectId, caseId, true, run.trial);
    const auditId = crypto.randomUUID();
    try {
      const committed = await this.db.batch([
        this.db
          .prepare(`INSERT INTO audit_event(id,project_id,actor_id,action,target_type,target_id,payload_json,request_id,created_at)
        SELECT ?,?,?,'review.run.completed','qc_review',?,?,?,?
        WHERE EXISTS(SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id JOIN review_case rc ON rc.project_id=p.id JOIN user_profile u ON u.id=pm.user_id
          WHERE pm.user_id=? AND p.id=? AND p.status='active' AND rc.id=? AND rc.status<>'archived' AND rc.discipline='FIN'
          AND pm.role IN ('workspace_admin','project_owner','reviewer')
          AND NOT EXISTS(SELECT 1 FROM employee_account e WHERE e.id=pm.user_id AND e.active=0)
          AND (?=0 OR lower(u.email) IN ('yjw@con-cost.com','yjpark@con-cost.com')))`)
          .bind(
            auditId,
            projectId,
            actor.id,
            id,
            JSON.stringify({ caseId }),
            requestId,
            Date.now(),
            actor.id,
            projectId,
            caseId,
            run.trial ? 1 : 0,
          ),
        this.db
          .prepare(
            'INSERT INTO qc_review_run SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_event WHERE id=?)',
          )
          .bind(
            id,
            projectId,
            caseId,
            run.profileId,
            run.profileVersion,
            run.trial ? 1 : 0,
            objectKey,
            digest,
            run.findings.length,
            run.rows.length,
            run.actorId,
            run.createdAt,
            auditId,
          ),
      ]);
      if (committed.some((entry) => entry.meta.changes !== 1))
        fail(
          403,
          'QC_PERMISSION_CHANGED',
          '저장 중 검수 권한이 변경되었습니다.',
        );
    } catch (error) {
      const committed = await this.db
        .prepare(
          'SELECT sha256 FROM qc_review_run WHERE id=? AND project_id=? AND case_id=?',
        )
        .bind(id, projectId, caseId)
        .first<{ sha256: string }>();
      if (committed?.sha256 !== digest) throw error;
      await this.authorize(actor, projectId, caseId, true, run.trial);
    }
  }
}
