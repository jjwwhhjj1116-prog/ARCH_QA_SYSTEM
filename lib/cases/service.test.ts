import { describe, expect, it, vi } from 'vitest';
import type { Actor, ReviewCaseSummary } from '@/lib/domain/contracts';
import type { ReviewCaseRepository } from './repository';
import { ReviewCaseService } from './service';

const actor: Actor = {
  id: 'actor-1',
  email: 'reviewer@example.com',
  displayName: '검수자',
  source: 'workspace',
};

describe('review case service', () => {
  it('creates a normalized validated review case record', async () => {
    const create = vi.fn().mockImplementation((record) =>
      Promise.resolve({
        ...record,
        status: 'draft',
        ownerId: record.actor.id,
        createdAt: record.createdAt.toISOString(),
      } as ReviewCaseSummary),
    );
    const repository = {
      create,
      listForActor: vi.fn(),
    } as ReviewCaseRepository;
    const service = new ReviewCaseService(repository);
    await service.create(
      '11111111-1111-4111-8111-111111111111',
      actor,
      { name: ' 1차 FIN 검수 ', discipline: 'FIN' },
      'request-1',
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: '1차 FIN 검수', discipline: 'FIN' }),
    );
  });

  it('rejects an unsupported discipline before repository access', async () => {
    const create = vi.fn();
    const repository = {
      create,
      listForActor: vi.fn(),
    } as ReviewCaseRepository;
    const service = new ReviewCaseService(repository);
    await expect(
      service.create(
        '11111111-1111-4111-8111-111111111111',
        actor,
        { name: '검수', discipline: 'STEEL' } as never,
        'request-1',
      ),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
