import { reviewStorage } from '@/lib/files/review-storage';
import { getD1Binding } from '@/db';
import type { Actor } from '@/lib/domain/contracts';
import { RequestBoundaryError } from '@/lib/http/request-boundary';
import type { BasicJobStatus, Mapping, ReviewSource, Run } from './contracts';
import type { ReviewService } from './server';
import {
  baselineSource,
  combineBaseline,
  packEvidence,
  unpackEvidence,
  baselineProfile,
  BASELINE_VERSION,
  type BaselinePart,
} from './baseline';
import { WorkbookError } from './workbook';
import { ReviewLimitError } from './engine';
import { tokenHash } from '@/lib/auth/password';

type PartRef = {
  key?: string;
  sha?: string;
  sourceHash?: string;
  error?: string;
  filename: string;
};
type Job = {
  id: string;
  project_id: string;
  case_id: string;
  actor_id: string;
  sources_json: string;
  mappings_json: string;
  policy_json: string;
  parts_json: string;
  cursor: number;
  version: number;
  lease_token: string | null;
  lease_until: number;
  state: BasicJobStatus['state'];
  error: string | null;
  created_at: string;
};
export const BASIC_POLICY = JSON.stringify({
  engine: BASELINE_VERSION,
  parser: 'fin-workbook-2.0',
  normalizer: 'fin-basic-normalizer-1.0',
  profile: baselineProfile,
});
function fail(status: number, code: string, message: string): never {
  throw new RequestBoundaryError(status, code, message);
}
export function basicStatus(job: Job): BasicJobStatus {
  const sources = JSON.parse(job.sources_json) as ReviewSource[];
  return {
    id: job.id,
    state: job.state,
    completedFiles: job.cursor,
    totalFiles: sources.length,
    currentFile: sources[job.cursor]?.filename ?? null,
    stage:
      job.state === 'completed'
        ? 'completed'
        : job.state === 'failed'
          ? 'failed'
          : job.cursor === sources.length
            ? 'results'
            : 'files',
    error: job.error,
  };
}
export class BaselineService {
  private db = getD1Binding();
  constructor(private review: ReviewService) {}
  async start(
    actor: Actor,
    projectId: string,
    caseId: string,
    requestKey: string,
  ): Promise<BasicJobStatus> {
    await this.review.authorize(actor, projectId, caseId, true);
    const existing = await this.db
      .prepare(
        'SELECT * FROM qc_basic_job WHERE project_id=? AND case_id=? AND actor_id=? AND request_key=?',
      )
      .bind(projectId, caseId, actor.id, requestKey)
      .first<Job>();
    if (existing) return basicStatus(existing);
    const state = await this.review.state(actor, projectId, caseId);
    if (!state.sources.length)
      fail(
        409,
        'NO_STORED_SOURCES',
        '저장된 원본 자료가 없습니다. 자료를 먼저 등록해 주세요.',
      );
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO qc_basic_job(id,project_id,case_id,actor_id,request_key,sources_json,mappings_json,policy_json,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'running',?,?) ON CONFLICT(project_id,case_id,actor_id,request_key) DO NOTHING`,
      )
      .bind(
        id,
        projectId,
        caseId,
        actor.id,
        requestKey,
        JSON.stringify(state.sources),
        JSON.stringify(state.mappings),
        BASIC_POLICY,
        now,
        now,
      )
      .run();
    const job = await this.db
      .prepare(
        'SELECT * FROM qc_basic_job WHERE project_id=? AND case_id=? AND actor_id=? AND request_key=?',
      )
      .bind(projectId, caseId, actor.id, requestKey)
      .first<Job>();
    if (!job)
      fail(
        503,
        'JOB_NOT_CREATED',
        '검수 작업을 시작하지 못했습니다. 다시 시도해 주세요.',
      );
    return basicStatus(job);
  }
  async continue(
    actor: Actor,
    projectId: string,
    caseId: string,
    id: string,
    requestId: string,
  ): Promise<BasicJobStatus> {
    await this.review.authorize(actor, projectId, caseId, true);
    const job = await this.db
      .prepare(
        'SELECT * FROM qc_basic_job WHERE id=? AND project_id=? AND case_id=? AND actor_id=?',
      )
      .bind(id, projectId, caseId, actor.id)
      .first<Job>();
    if (!job)
      fail(404, 'JOB_NOT_FOUND', '이 계정의 검수 작업을 찾지 못했습니다.');
    if (job.state !== 'running' || job.lease_until > Date.now())
      return basicStatus(job);
    if (job.policy_json !== BASIC_POLICY) {
      const message =
        '검수 처리 기준이 업데이트되었습니다. 이전 결과는 보존됩니다. 새 검수를 시작해 주세요.';
      await this.db
        .prepare(
          "UPDATE qc_basic_job SET state='failed',error=?,updated_at=? WHERE id=? AND version=? AND state='running'",
        )
        .bind(message, new Date().toISOString(), id, job.version)
        .run();
      return basicStatus({ ...job, state: 'failed', error: message });
    }
    const lease = crypto.randomUUID();
    const acquired = await this.db
      .prepare(
        `UPDATE qc_basic_job SET lease_token=?,lease_until=?,version=version+1 WHERE id=? AND version=? AND state='running' AND lease_until<=?`,
      )
      .bind(lease, Date.now() + 120_000, id, job.version, Date.now())
      .run();
    if (acquired.meta.changes !== 1) return basicStatus(job);
    const sources = JSON.parse(job.sources_json) as ReviewSource[];
    const parts = JSON.parse(job.parts_json) as PartRef[];
    const saved = JSON.parse(job.mappings_json) as Mapping[];
    try {
      if (job.cursor < sources.length) {
        const source = sources[job.cursor]!;
        let part: PartRef = { filename: source.filename };
        try {
          const parsed = await this.review.readSource(
            projectId,
            caseId,
            source,
          );
          if (parts.some((p) => p.sourceHash === parsed.sha256))
            part.error = '동일 해시 파일 — 중복 표본 제외';
          else {
            const result = baselineSource(
              parsed.sheets,
              {
                filename: source.filename,
                sourceVersionId: source.sourceVersionId,
                sha256: parsed.sha256,
              },
              saved,
            );
            const stored = await this.store(
              projectId,
              caseId,
              id,
              `${job.cursor}-${lease}`,
              packEvidence(result),
            );
            part = {
              filename: source.filename,
              ...stored,
              sourceHash: parsed.sha256,
            };
          }
        } catch (error) {
          if (
            !(
              error instanceof WorkbookError ||
              error instanceof ReviewLimitError
            )
          )
            throw error;
          part.error = error.message;
        }
        parts.push(part);
        await this.review.authorize(actor, projectId, caseId, true);
        const updated = await this.db
          .prepare(
            `UPDATE qc_basic_job SET parts_json=?,cursor=cursor+1,lease_token=NULL,lease_until=0,updated_at=? WHERE id=? AND lease_token=? AND state='running'`,
          )
          .bind(JSON.stringify(parts), new Date().toISOString(), id, lease)
          .run();
        if (updated.meta.changes !== 1)
          fail(
            409,
            'JOB_LEASE_LOST',
            '다른 요청에서 처리한 작업입니다. 진행 상태를 다시 확인하세요.',
          );
        return basicStatus({ ...job, cursor: job.cursor + 1 });
      }
      const data: BaselinePart[] = [];
      let totalBytes = 0;
      for (const part of parts)
        if (part.key && part.sha) {
          const object = await reviewStorage().get(part.key);
          if (!object || (totalBytes += object.size) > 16 * 1024 * 1024)
            throw new ReviewLimitError(
              '기본검사 근거 총량 16MB 한도를 넘었거나 저장된 근거를 읽지 못했습니다. 완료로 처리하지 않습니다.',
            );
          const text = await object.text();
          if ((await tokenHash(text)) !== part.sha)
            fail(
              409,
              'JOB_INTEGRITY',
              '처리된 자료의 해시가 일치하지 않습니다.',
            );
          data.push(unpackEvidence<BaselinePart>(JSON.parse(text)));
        }
      const combined = combineBaseline(data);
      if (!combined.rowCount)
        throw new ReviewLimitError(
          '검사 가능한 상세 산출서·동별집계표를 읽지 못했습니다. 자료 종류와 파일 오류를 확인해 주세요. ' +
            [
              ...parts
                .filter((p) => p.error)
                .map((p) => `${p.filename}: ${p.error}`),
              ...combined.limitations,
            ]
              .slice(0, 3)
              .join(' / '),
        );
      combined.limitations.unshift(
        ...parts.filter((p) => p.error).map((p) => `${p.filename}: ${p.error}`),
      );
      const current = await this.review.state(actor, projectId, caseId);
      const merged = new Map(
        saved.map((m) => [JSON.stringify([m.sourceVersionId, m.sheet]), m]),
      );
      for (const mapping of combined.mappings) {
        const key = JSON.stringify([mapping.sourceVersionId, mapping.sheet]);
        if (mapping.confirmed && !merged.has(key)) merged.set(key, mapping);
      }
      if (
        JSON.stringify(current.mappings) === job.mappings_json &&
        merged.size <= 60 &&
        merged.size > saved.length
      ) {
        try {
          await this.review.mutate(
            actor,
            projectId,
            {
              action: 'mapping',
              caseId,
              baseVersionId: current.mappingVersionId,
              mappings: [...merged.values()],
            },
            `${job.id}:auto-mapping`,
          );
        } catch (error) {
          if (
            !(
              error instanceof RequestBoundaryError &&
              error.code === 'MAPPING_CONFLICT'
            ) &&
            !(
              error instanceof Error &&
              error.message.includes('MAPPING_CONFLICT')
            )
          )
            throw error;
          combined.limitations.push(
            '다른 창의 열 연결 변경을 유지했습니다. 이 실행은 시작 시점의 연결과 자동 인식 스냅샷으로 검사했습니다.',
          );
        }
      }
      const run: Run = {
        ...combined,
        id,
        projectId,
        caseId,
        actorId: actor.id,
        createdAt: new Date().toISOString(),
        kind: 'baseline',
        trial: false,
        profileId: 'product-baseline',
        profileVersion: 1,
        profile: baselineProfile,
        engineVersion: BASELINE_VERSION,
      };
      const stored = await this.store(
        projectId,
        caseId,
        id,
        `result-${lease}`,
        packEvidence(run),
      );
      await this.review.authorize(actor, projectId, caseId, true);
      const committed = await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO qc_basic_run SELECT id,project_id,case_id,?,?,?,?,actor_id,? FROM qc_basic_job WHERE id=? AND state='running' AND lease_token=?`,
          )
          .bind(
            stored.key,
            stored.sha,
            run.findings.length,
            run.rowCount ?? 0,
            run.createdAt,
            id,
            lease,
          ),
        this.db
          .prepare(
            `INSERT INTO audit_event(id,project_id,actor_id,action,target_type,target_id,payload_json,request_id,created_at) SELECT ?,project_id,actor_id,'review.baseline.completed','qc_review',id,?,?,? FROM qc_basic_job WHERE id=? AND state='running' AND lease_token=?`,
          )
          .bind(
            crypto.randomUUID(),
            JSON.stringify({
              caseId,
              engineVersion: BASELINE_VERSION,
              externalAiTokens: 0,
            }),
            requestId,
            Date.now(),
            id,
            lease,
          ),
        this.db
          .prepare(
            `UPDATE qc_basic_job SET state='completed',lease_token=NULL,lease_until=0,updated_at=? WHERE id=? AND lease_token=? AND state='running'`,
          )
          .bind(run.createdAt, id, lease),
      ]);
      if (committed.some((entry) => entry.meta.changes !== 1))
        fail(
          409,
          'JOB_LEASE_LOST',
          '완료 저장 권한이 다른 요청으로 이동했습니다. 실행 이력을 다시 확인하세요.',
        );
      return basicStatus({ ...job, state: 'completed' });
    } catch (error) {
      const message =
        error instanceof ReviewLimitError
          ? error.message
          : '검수 처리를 마치지 못했습니다. 원본은 보존되며 새 실행으로 다시 시도할 수 있습니다.';
      try {
        await this.db
          .prepare(
            `UPDATE qc_basic_job SET state='failed',error=?,lease_token=NULL,lease_until=0,updated_at=? WHERE id=? AND lease_token=? AND state='running'`,
          )
          .bind(message, new Date().toISOString(), id, lease)
          .run();
      } catch {
        if (error instanceof RequestBoundaryError) throw error;
        fail(
          503,
          'JOB_STATUS_UNAVAILABLE',
          '검수 상태를 저장하지 못했습니다. 권한과 연결을 확인해 주세요. 완료로 처리하지 않았습니다.',
        );
      }
      if (error instanceof RequestBoundaryError) throw error;
      return basicStatus({ ...job, state: 'failed', error: message });
    }
  }
  private async store(
    projectId: string,
    caseId: string,
    id: string,
    suffix: string,
    value: unknown,
  ) {
    const text = JSON.stringify(value);
    if (new TextEncoder().encode(text).byteLength > 12 * 1024 * 1024)
      throw new ReviewLimitError(
        '검수 근거 파일당 12MB 한도를 넘었습니다. 이 자료는 미완료로 표시합니다.',
      );
    const key = `projects/${projectId}/cases/${caseId}/basic/${id}/${suffix}.json`;
    const sha = await tokenHash(text);
    await reviewStorage().put(key, text, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { projectId, caseId, sha256: sha },
    });
    return { key, sha };
  }
}
