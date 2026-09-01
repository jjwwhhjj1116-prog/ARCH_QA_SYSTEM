import type {
  Actor,
  ProjectRole,
  ProjectSummary,
} from '@/lib/domain/contracts';

export type NewProjectRecord = {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  actor: Actor;
  role: ProjectRole;
  requestId: string;
  createdAt: Date;
};

export interface ProjectRepository {
  listForActor(actorId: string): Promise<ProjectSummary[]>;
  create(record: NewProjectRecord): Promise<ProjectSummary>;
}

export class ProjectConflictError extends Error {
  readonly code = 'PROJECT_CODE_CONFLICT';
}
