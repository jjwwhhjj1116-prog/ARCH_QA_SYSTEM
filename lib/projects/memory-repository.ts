import type { ProjectSummary } from '@/lib/domain/contracts';
import type { NewProjectRecord, ProjectRepository } from './repository';
import { ProjectConflictError } from './repository';

export class MemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, ProjectSummary>();
  private readonly members = new Map<string, Set<string>>();
  readonly audit: Array<{
    actorId: string;
    action: string;
    projectId: string;
    requestId: string;
  }> = [];

  async listForActor(actorId: string): Promise<ProjectSummary[]> {
    const ids = this.members.get(actorId) ?? new Set();
    return [...ids]
      .map((id) => this.projects.get(id))
      .filter((item): item is ProjectSummary => item !== undefined);
  }

  async create(record: NewProjectRecord): Promise<ProjectSummary> {
    if ([...this.projects.values()].some((item) => item.code === record.code)) {
      throw new ProjectConflictError('이미 사용 중인 프로젝트 코드입니다.');
    }
    const project: ProjectSummary = {
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
    this.projects.set(project.id, project);
    const current = this.members.get(record.actor.id) ?? new Set<string>();
    current.add(project.id);
    this.members.set(record.actor.id, current);
    this.audit.push({
      actorId: record.actor.id,
      action: 'project.created',
      projectId: project.id,
      requestId: record.requestId,
    });
    return project;
  }
}
