import { beforeEach, describe, expect, it, vi } from 'vitest';

const archive = vi.fn();

vi.mock('@/lib/projects/d1-repository', () => ({
  D1ProjectRepository: class {
    listForActor = vi.fn();
    create = vi.fn();
    archive = archive;
  },
}));

const { DELETE } = await import('./route');
const projectId = '11111111-1111-4111-8111-111111111111';

describe('project archive API boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LOCAL_DEMO_MODE = 'true';
    archive.mockResolvedValue({
      id: projectId,
      code: 'MANUAL-1',
      name: '부산대연',
      clientName: '한화건설',
      status: 'archived',
      role: 'project_owner',
      openCaseCount: 1,
      needsAttentionCount: 0,
      createdAt: new Date(0).toISOString(),
    });
  });

  it('archives with an exact confirmation name and returns archive mode', async () => {
    const response = await DELETE(
      new Request(`http://localhost/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmationName: '부산대연' }),
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { id: projectId, status: 'archived', deletionMode: 'archive' },
    });
    expect(archive).toHaveBeenCalledOnce();
  });

  it('rejects cross-site archive requests before repository access', async () => {
    const response = await DELETE(
      new Request(`http://localhost/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          'sec-fetch-site': 'cross-site',
        },
        body: JSON.stringify({ confirmationName: '부산대연' }),
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(response.status).toBe(403);
    expect(archive).not.toHaveBeenCalled();
  });

  it('rejects a missing confirmation name', async () => {
    const response = await DELETE(
      new Request(`http://localhost/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      { params: Promise.resolve({ projectId }) },
    );
    expect(response.status).toBe(400);
    expect(archive).not.toHaveBeenCalled();
  });
});
