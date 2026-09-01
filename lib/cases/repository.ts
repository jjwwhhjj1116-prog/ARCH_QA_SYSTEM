import type {
  Actor,
  ProjectRole,
  ReviewCaseSummary,
} from '@/lib/domain/contracts';
import { can } from '@/lib/domain/permissions';

export type NewReviewCaseRecord = {
  id: string;
  projectId: string;
  name: string;
  discipline: 'FIN' | 'RC';
  actor: Actor;
  requestId: string;
  createdAt: Date;
};

export interface ReviewCaseRepository {
  listForActor(
    projectId: string,
    actorId: string,
  ): Promise<ReviewCaseSummary[]>;
  create(record: NewReviewCaseRecord): Promise<ReviewCaseSummary>;
}

export class CaseAccessError extends Error {
  readonly code = 'CASE_ACCESS_DENIED';
}

export function roleCanCreateCase(role: ProjectRole): boolean {
  return can(role, 'case:create');
}
