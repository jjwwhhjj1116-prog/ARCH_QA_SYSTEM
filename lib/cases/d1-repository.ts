import { getD1Binding } from '@/db';
import type { ReviewCaseSummary } from '@/lib/domain/contracts';
import type { NewReviewCaseRecord, ReviewCaseRepository } from './repository';
import { CaseAccessError } from './repository';

type MembershipRow = { role: string };
type CaseRow = {
  id: string;
  project_id: string;
  name: string;
  discipline: 'FIN' | 'RC';
  status: ReviewCaseSummary['status'];
  owner_id: string;
  created_at: number;
};

const CASE_ROLES = "'workspace_admin','project_owner','reviewer'";

export class D1ReviewCaseRepository implements ReviewCaseRepository {
  async listForActor(
    projectId: string,
    actorId: string,
  ): Promise<ReviewCaseSummary[]> {
    const binding = getD1Binding();
    const [membershipRaw, casesRaw] = await binding.batch([
      binding
        .prepare(
          'SELECT role FROM project_member WHERE project_id = ? AND user_id = ? LIMIT 1',
        )
        .bind(projectId, actorId),
      binding
        .prepare(
          `SELECT rc.id, rc.project_id, rc.name, rc.discipline, rc.status, rc.owner_id, rc.created_at
           FROM review_case rc
           INNER JOIN project_member pm ON pm.project_id = rc.project_id
           WHERE rc.project_id = ? AND pm.user_id = ?
           ORDER BY rc.created_at DESC, rc.id DESC`,
        )
        .bind(projectId, actorId),
    ]);
    const membership = membershipRaw as D1Result<MembershipRow>;
    if ((membership.results?.length ?? 0) === 0) {
      throw new CaseAccessError(
        '이 프로젝트의 검수 케이스를 볼 권한이 없습니다.',
      );
    }
    const cases = casesRaw as D1Result<CaseRow>;
    return (cases.results ?? []).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      discipline: row.discipline,
      status: row.status,
      ownerId: row.owner_id,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async create(record: NewReviewCaseRecord): Promise<ReviewCaseSummary> {
    const binding = getD1Binding();
    const auditId = crypto.randomUUID();
    const createdAt = record.createdAt.getTime();
    const [caseResult, auditResult] = await binding.batch([
      binding
        .prepare(
          `INSERT INTO review_case
             (id, project_id, name, discipline, status, owner_id, created_at)
           SELECT ?, ?, ?, ?, 'draft', ?, ?
           FROM project_member pm
           INNER JOIN project p ON p.id = pm.project_id
           WHERE pm.project_id = ? AND pm.user_id = ?
             AND pm.role IN (${CASE_ROLES}) AND p.status = 'active'`,
        )
        .bind(
          record.id,
          record.projectId,
          record.name,
          record.discipline,
          record.actor.id,
          createdAt,
          record.projectId,
          record.actor.id,
        ),
      binding
        .prepare(
          `INSERT INTO audit_event
             (id, project_id, actor_id, action, target_type, target_id, payload_json, request_id, created_at)
           SELECT ?, ?, ?, 'review_case.created', 'review_case', ?, ?, ?, ?
           FROM review_case rc
           INNER JOIN project_member pm ON pm.project_id = rc.project_id
           INNER JOIN project p ON p.id = pm.project_id
           WHERE rc.id = ? AND rc.project_id = ? AND rc.owner_id = ?
             AND pm.user_id = ? AND pm.role IN (${CASE_ROLES})
             AND p.status = 'active'`,
        )
        .bind(
          auditId,
          record.projectId,
          record.actor.id,
          record.id,
          JSON.stringify({ name: record.name, discipline: record.discipline }),
          record.requestId,
          createdAt,
          record.id,
          record.projectId,
          record.actor.id,
          record.actor.id,
        ),
    ]);
    if (caseResult.meta.changes !== 1 || auditResult.meta.changes !== 1) {
      throw new CaseAccessError(
        '이 프로젝트에 검수 케이스를 만들 권한이 없습니다.',
      );
    }

    return {
      id: record.id,
      projectId: record.projectId,
      name: record.name,
      discipline: record.discipline,
      status: 'draft',
      ownerId: record.actor.id,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
