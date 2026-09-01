import { and, eq, inArray, ne } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  auditEvents,
  projectMembers,
  projects,
  reviewCases,
  userProfiles,
} from '@/db/schema';
import type { ProjectRole, ProjectSummary } from '@/lib/domain/contracts';
import type { NewProjectRecord, ProjectRepository } from './repository';
import { ProjectConflictError } from './repository';

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
      .where(eq(projectMembers.userId, actorId));

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
}
