// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { defaultProfile } from './contracts';
import { ReviewService, reviewRequestSchema } from './server';

const mock = vi.hoisted(() => ({ role: 'reviewer', first: vi.fn() }));
vi.mock('cloudflare:workers', () => ({ env: { FILES: { get: vi.fn() } } }));
vi.mock('@/db', () => ({
  getD1Binding: () => ({
    prepare: () => ({
      bind: () => ({
        first: async () => ({ role: mock.role, discipline: 'FIN' }),
        all: async () => ({ results: [] }),
      }),
    }),
  }),
}));
vi.mock('@/lib/files/r2-factory', () => ({ getPrivateFileStorage: vi.fn() }));
vi.mock('@/lib/ingestion/d1-repository', () => ({
  D1SourcePackageRepository: class {
    listForActor = async () => [];
  },
}));
const id = '10000000-0000-4000-8000-000000000001';
const actor = {
  source: 'workspace' as const,
  id: 'user',
  email: 'synthetic@example.invalid',
  displayName: '합성 사용자',
};
describe('guideline administration API boundaries', () => {
  it.each([
    'workspace_admin',
    'project_owner',
    'reviewer',
    'approver',
    'viewer',
  ])('rejects direct guideline actions from %s', async (role) => {
    mock.role = role;
    for (const input of [
      { action: 'profile', caseId: id, profile: defaultProfile },
      { action: 'approve', caseId: id, profileId: id, trialRunId: id },
      { action: 'run', caseId: id, profileId: id, trial: true },
    ]) {
      await expect(
        new ReviewService().mutate(
          actor,
          id,
          reviewRequestSchema.parse(input),
          'request',
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
  });
  it.each(['workspace_admin', 'project_owner'])(
    'accepts current administrator role %s',
    async (role) => {
      mock.role = role;
      await expect(
        new ReviewService().authorize(
          { ...actor, email: 'yjw@con-cost.com' },
          id,
          id,
          true,
          true,
        ),
      ).resolves.toMatchObject({ role });
    },
  );
});
