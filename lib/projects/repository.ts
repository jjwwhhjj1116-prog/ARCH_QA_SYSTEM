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

export type ArchiveProjectRecord = {
  projectId: string;
  confirmationName: string;
  actor: Actor;
  requestId: string;
  archivedAt: Date;
};

export interface ProjectRepository {
  listForActor(actorId: string): Promise<ProjectSummary[]>;
  create(record: NewProjectRecord): Promise<ProjectSummary>;
  archive(record: ArchiveProjectRecord): Promise<ProjectSummary>;
}

export class ProjectConflictError extends Error {
  readonly code = 'PROJECT_CODE_CONFLICT';
}

export class ProjectAccessError extends Error {
  readonly code = 'PROJECT_ARCHIVE_FORBIDDEN';
}

export class ProjectNotFoundError extends Error {
  readonly code = 'PROJECT_NOT_FOUND';
}

export class ProjectConfirmationError extends Error {
  readonly code = 'PROJECT_CONFIRMATION_MISMATCH';
}
