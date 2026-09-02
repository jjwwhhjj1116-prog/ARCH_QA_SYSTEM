import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SourcePackageAccessError,
  SourcePackageConflictError,
} from '@/lib/ingestion/repository';

const archive = vi.fn();

vi.mock('@/lib/ingestion/d1-repository', () => ({
  D1SourcePackageRepository: class {
    archive = archive;
  },
}));

const { DELETE } = await import('./route');
const projectId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';
const packageId = '33333333-3333-4333-8333-333333333333';
const context = {
  params: Promise.resolve({ projectId, caseId, packageId }),
};

describe('source package archive API boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LOCAL_DEMO_MODE = 'true';
    archive.mockResolvedValue({
      id: packageId,
      status: 'aborted',
      deletionMode: 'soft_abort',
      retainedForAudit: true,
    });
  });

  it('soft-aborts the exact project, case, package and version', async () => {
    const response = await DELETE(request(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        id: packageId,
        status: 'aborted',
        deletionMode: 'soft_abort',
        retainedForAudit: true,
      },
    });
    expect(archive).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        reviewCaseId: caseId,
        packageId,
        expectedVersion: 3,
        actor: expect.objectContaining({ id: 'local-user-owner' }),
      }),
    );
  });

  it('requires same-site mutation and an exact version', async () => {
    const crossSite = await DELETE(
      request({ 'sec-fetch-site': 'cross-site' }),
      context,
    );
    expect(crossSite.status).toBe(403);

    const missingVersion = await DELETE(request({ 'if-match': '' }), context);
    expect(missingVersion.status).toBe(400);
    expect(archive).not.toHaveBeenCalled();
  });

  it('keeps access and concurrent-state failures fail-closed', async () => {
    archive.mockRejectedValueOnce(
      new SourcePackageAccessError('삭제 권한이 없습니다.'),
    );
    const forbidden = await DELETE(request(), context);
    expect(forbidden.status).toBe(403);

    archive.mockRejectedValueOnce(
      new SourcePackageConflictError('현재 저장 처리 중입니다.'),
    );
    const conflict = await DELETE(request(), context);
    expect(conflict.status).toBe(409);
  });
});

function request(headers: Record<string, string> = {}): Request {
  return new Request(
    `http://localhost/api/projects/${projectId}/cases/${caseId}/source-packages/${packageId}`,
    {
      method: 'DELETE',
      headers: { 'if-match': '"3"', ...headers },
    },
  );
}
