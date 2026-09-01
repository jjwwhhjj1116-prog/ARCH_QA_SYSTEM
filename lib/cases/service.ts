import type {
  Actor,
  CreateReviewCaseInput,
  ReviewCaseSummary,
} from '@/lib/domain/contracts';
import { createReviewCaseSchema } from '@/lib/domain/contracts';
import type { ReviewCaseRepository } from './repository';

export class ReviewCaseService {
  constructor(private readonly repository: ReviewCaseRepository) {}

  list(projectId: string, actor: Actor): Promise<ReviewCaseSummary[]> {
    return this.repository.listForActor(projectId, actor.id);
  }

  async create(
    projectId: string,
    actor: Actor,
    input: CreateReviewCaseInput,
    requestId: string,
  ): Promise<ReviewCaseSummary> {
    const parsed = createReviewCaseSchema.parse(input);
    return await this.repository.create({
      id: crypto.randomUUID(),
      projectId,
      name: parsed.name,
      discipline: parsed.discipline,
      actor,
      requestId,
      createdAt: new Date(),
    });
  }
}
