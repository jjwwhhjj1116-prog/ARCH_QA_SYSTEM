import type { ProjectSummary } from '@/lib/domain/contracts';
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

export class MemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, ProjectSummary>();
  private readonly members = new Map<string, Set<string>>();
  private readonly memberRoles = new Map<string, ProjectSummary['role']>();
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
      .filter(
        (item): item is ProjectSummary =>
          item !== undefined && item.status === 'active',
      );
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
    this.memberRoles.set(`${record.actor.id}\u0000${project.id}`, record.role);
    this.audit.push({
      actorId: record.actor.id,
      action: 'project.created',
      projectId: project.id,
      requestId: record.requestId,
    });
    return project;
  }

  async archive(record: ArchiveProjectRecord): Promise<ProjectSummary> {
    const project = this.projects.get(record.projectId);
    if (!project || project.status !== 'active') {
      throw new ProjectNotFoundError('활성 프로젝트를 찾을 수 없습니다.');
    }
    const role = this.memberRoles.get(
      `${record.actor.id}\u0000${record.projectId}`,
    );
    if (role !== 'workspace_admin' && role !== 'project_owner') {
      throw new ProjectAccessError('이 프로젝트를 보관할 권한이 없습니다.');
    }
    if (record.confirmationName !== project.name) {
      throw new ProjectConfirmationError(
        '확인을 위해 입력한 프로젝트명이 일치하지 않습니다.',
      );
    }
    const archived = { ...project, status: 'archived' as const };
    this.projects.set(project.id, archived);
    this.audit.push({
      actorId: record.actor.id,
      action: 'project.archived',
      projectId: project.id,
      requestId: record.requestId,
    });
    return archived;
  }
}
