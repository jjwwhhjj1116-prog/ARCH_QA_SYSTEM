import { describe, expect, it } from 'vitest';
import type { Actor } from '@/lib/domain/contracts';
import { MemoryProjectRepository } from './memory-repository';
import { ProjectConflictError } from './repository';
import { ProjectService } from './service';

const actor: Actor = {
  id: 'actor-1',
  email: 'actor@example.com',
  displayName: '검수자',
  source: 'workspace',
};

describe('project service', () => {
  it('normalizes the code, creates owner membership and writes audit evidence', async () => {
    const repository = new MemoryProjectRepository();
    const service = new ProjectService(repository);
    const project = await service.create(
      actor,
      { code: ' f250218 c1 ', name: '덕천3구역', clientName: '한화건설' },
      'req-1',
    );
    expect(project.code).toBe('F250218C1');
    expect(project.role).toBe('project_owner');
    await expect(service.list(actor)).resolves.toHaveLength(1);
    expect(repository.audit).toEqual([
      {
        actorId: actor.id,
        action: 'project.created',
        projectId: project.id,
        requestId: 'req-1',
      },
    ]);
  });

  it('keeps projects outside a non-member actor list', async () => {
    const repository = new MemoryProjectRepository();
    const service = new ProjectService(repository);
    await service.create(
      actor,
      { code: 'P1', name: '프로젝트 1', clientName: '' },
      'req-1',
    );
    await expect(service.list({ ...actor, id: 'outsider' })).resolves.toEqual(
      [],
    );
  });

  it('rejects a duplicate canonical project code', async () => {
    const repository = new MemoryProjectRepository();
    const service = new ProjectService(repository);
    await service.create(
      actor,
      { code: 'P 1', name: '프로젝트 1', clientName: '' },
      'req-1',
    );
    await expect(
      service.create(
        actor,
        { code: 'p1', name: '프로젝트 2', clientName: '' },
        'req-2',
      ),
    ).rejects.toBeInstanceOf(ProjectConflictError);
  });
});
