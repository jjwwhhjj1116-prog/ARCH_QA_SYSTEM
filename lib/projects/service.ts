import type {
  Actor,
  CreateProjectInput,
  ProjectSummary,
} from '@/lib/domain/contracts';
import { createProjectSchema } from '@/lib/domain/contracts';
import { z } from 'zod';
import type { ProjectRepository } from './repository';

export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  list(actor: Actor): Promise<ProjectSummary[]> {
    return this.repository.listForActor(actor.id);
  }

  create(
    actor: Actor,
    input: CreateProjectInput,
    requestId: string,
  ): Promise<ProjectSummary> {
    const parsed = createProjectSchema.parse(input);
    const id = crypto.randomUUID();
    return this.repository.create({
      id,
      code: parsed.code
        ? canonicalProjectCode(parsed.code)
        : internalProjectCode(id),
      name: parsed.name,
      clientName: parsed.clientName || null,
      actor,
      role: 'project_owner',
      requestId,
      createdAt: new Date(),
    });
  }

  archive(
    projectId: string,
    actor: Actor,
    input: unknown,
    requestId: string,
  ): Promise<ProjectSummary> {
    const parsed = z
      .object({ confirmationName: z.string().trim().min(2).max(120) })
      .parse(input);
    return this.repository.archive({
      projectId,
      confirmationName: parsed.confirmationName,
      actor,
      requestId,
      archivedAt: new Date(),
    });
  }
}

export function canonicalProjectCode(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, '').toUpperCase();
}

function internalProjectCode(projectId: string): string {
  return `MANUAL-${projectId.replaceAll('-', '').toUpperCase()}`;
}
