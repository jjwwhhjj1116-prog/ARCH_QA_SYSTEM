import { and, eq, inArray, ne } from 'drizzle-orm';
import { getD1Binding, getDb } from '@/db';
import {
  auditEvents,
  projectMembers,
  projects,
  reviewCases,
  userProfiles,
} from '@/db/schema';
import type { ProjectRole, ProjectSummary } from '@/lib/domain/contracts';
import type {
  ArchiveProjectRecord,
  NewProjectRecord,
  ProjectRepository,
} from './repository';
import {
  ProjectAccessError,
  ProjectConfirmationError,
  ProjectConflictError,
  ProjectNotFoundError,
} from './repository';

export class D1ProjectRepository implements ProjectRepository {
  async listForActor(actorId: string): Promise<ProjectSummary[]> {
    const db = getDb();
    const visible = await db
      .select({
        id: projects.id,
        code: projects.code,
        name: projects.name,
        clientName: projects.clientName,
        status: projects.status,
        role: projectMembers.role,
        createdAt: projects.createdAt,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(
        and(eq(projectMembers.userId, actorId), eq(projects.status, 'active')),
      );

    if (visible.length === 0) return [];
    const projectIds = visible.map((row) => row.id);
    const cases = await db
      .select({ projectId: reviewCases.projectId, status: reviewCases.status })
      .from(reviewCases)
      .where(
        and(
          inArray(reviewCases.projectId, projectIds),
          ne(reviewCases.status, 'archived'),
        ),
      );

    return visible.map((row) => ({
      ...row,
      role: row.role as ProjectRole,
      openCaseCount: cases.filter((item) => item.projectId === row.id).length,
      needsAttentionCount: cases.filter(
        (item) =>
          item.projectId === row.id && item.status === 'needs_attention',
      ).length,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async create(record: NewProjectRecord): Promise<ProjectSummary> {
    const db = getDb();
    const memberId = crypto.randomUUID();
    const auditId = crypto.randomUUID();

    try {
      await db.batch([
        db
          .insert(userProfiles)
          .values({
            id: record.actor.id,
            email: record.actor.email,
            displayName: record.actor.displayName,
            createdAt: record.createdAt,
          })
          .onConflictDoUpdate({
            target: userProfiles.id,
            set: {
              email: record.actor.email,
              displayName: record.actor.displayName,
            },
          }),
        db.insert(projects).values({
          id: record.id,
          code: record.code,
          name: record.name,
          clientName: record.clientName,
          status: 'active',
          createdBy: record.actor.id,
          createdAt: record.createdAt,
        }),
        db.insert(projectMembers).values({
          id: memberId,
          projectId: record.id,
          userId: record.actor.id,
          role: record.role,
          createdAt: record.createdAt,
        }),
        db.insert(auditEvents).values({
          id: auditId,
          projectId: record.id,
          actorId: record.actor.id,
          action: 'project.created',
          targetType: 'project',
          targetId: record.id,
          payloadJson: JSON.stringify({ code: record.code, name: record.name }),
          requestId: record.requestId,
          createdAt: record.createdAt,
        }),
      ] as const);
    } catch (error) {
      const errorText = String(error).toLowerCase();
      if (
        errorText.includes('unique') &&
        (errorText.includes('project.code') ||
          errorText.includes('project_code_uq'))
      ) {
        throw new ProjectConflictError('이미 사용 중인 프로젝트 코드입니다.');
      }
      throw error;
    }

    return {
      id: record.id,
      code: record.code,
      name: record.name,
      clientName: record.clientName,
      status: 'active',
      role: record.role,
      openCaseCount: 0,
      needsAttentionCount: 0,
      createdAt: record.createdAt.toISOString(),
    };
  }

  async archive(record: ArchiveProjectRecord): Promise<ProjectSummary> {
    const binding = getD1Binding();
    const row = await binding
      .prepare(
        `SELECT p.id, p.code, p.name, p.client_name, p.status, p.created_at,
                pm.role,
                (SELECT COUNT(*) FROM review_case rc
                  WHERE rc.project_id = p.id AND rc.status <> 'archived') AS open_case_count,
                (SELECT COUNT(*) FROM review_case rc
                  WHERE rc.project_id = p.id AND rc.status = 'needs_attention') AS needs_attention_count
         FROM project p
         LEFT JOIN project_member pm
           ON pm.project_id = p.id AND pm.user_id = ?
         WHERE p.id = ?
         LIMIT 1`,
      )
      .bind(record.actor.id, record.projectId)
      .first<{
        id: string;
        code: string;
        name: string;
        client_name: string | null;
        status: 'active' | 'archived';
        created_at: number;
        role: ProjectRole | null;
        open_case_count: number;
        needs_attention_count: number;
      }>();
    if (!row || row.status !== 'active') {
      throw new ProjectNotFoundError('활성 프로젝트를 찾을 수 없습니다.');
    }
    if (row.role !== 'workspace_admin' && row.role !== 'project_owner') {
      throw new ProjectAccessError('이 프로젝트를 보관할 권한이 없습니다.');
    }
    if (record.confirmationName !== row.name) {
      throw new ProjectConfirmationError(
        '확인을 위해 입력한 프로젝트명이 일치하지 않습니다.',
      );
    }
    const archivedAt = record.archivedAt.getTime();
    const results = await binding.batch([
      binding
        .prepare(
          `INSERT INTO audit_event
             (id, project_id, actor_id, action, target_type, target_id,
              payload_json, request_id, created_at)
           SELECT ?, p.id, ?, 'project.archived', 'project', p.id, ?, ?, ?
           FROM project p
           INNER JOIN project_member pm ON pm.project_id = p.id
           WHERE p.id = ? AND p.status = 'active' AND p.name = ?
             AND pm.user_id = ? AND pm.role IN ('workspace_admin','project_owner')`,
        )
        .bind(
          crypto.randomUUID(),
          record.actor.id,
          JSON.stringify({ name: row.name, deletionMode: 'archive' }),
          record.requestId,
          archivedAt,
          record.projectId,
          record.confirmationName,
          record.actor.id,
        ),
      binding
        .prepare(
          `UPDATE project
           SET status = 'archived'
           WHERE id = ? AND status = 'active' AND name = ?
             AND EXISTS (
               SELECT 1 FROM project_member pm
               WHERE pm.project_id = project.id AND pm.user_id = ?
                 AND pm.role IN ('workspace_admin','project_owner')
             )`,
        )
        .bind(record.projectId, record.confirmationName, record.actor.id),
    ]);
    if (results.some((result) => result.meta.changes !== 1)) {
      throw new ProjectConflictError(
        '프로젝트 상태가 변경되었습니다. 목록을 새로고침해 주세요.',
      );
    }
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      clientName: row.client_name,
      status: 'archived',
      role: row.role,
      openCaseCount: row.open_case_count,
      needsAttentionCount: row.needs_attention_count,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
