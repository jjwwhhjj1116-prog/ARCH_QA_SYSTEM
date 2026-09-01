import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn().mockImplementation((record) =>
  Promise.resolve({
    id: record.id,
    projectId: record.projectId,
    name: record.name,
    discipline: record.discipline,
    status: 'draft',
    ownerId: record.actor.id,
    createdAt: record.createdAt.toISOString(),
  }),
);

vi.mock('@/lib/cases/d1-repository', () => ({
  D1ReviewCaseRepository: class {
    listForActor = vi.fn().mockResolvedValue([]);
    create = create;
  },
}));

const { GET, POST } = await import('./route');
const projectId = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ projectId }) };

describe('review cases API boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LOCAL_DEMO_MODE = 'true';
  });

  it('creates a bounded validated case', async () => {
    const response = await POST(
      new Request(`http://localhost/api/projects/${projectId}/cases`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '1차 FIN 검수', discipline: 'FIN' }),
      }),
      context,
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: { projectId, discipline: 'FIN', status: 'draft' },
    });
  });

  it('lists cases through the authenticated project boundary', async () => {
    const response = await GET(
      new Request(`http://localhost/api/projects/${projectId}/cases`),
      context,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: [] });
  });

  it.each([
    ['malformed JSON', 'application/json', '{', 400, 'INVALID_JSON'],
    ['wrong media type', 'text/plain', '{}', 415, 'JSON_REQUIRED'],
  ])('rejects %s', async (_label, contentType, body, status, code) => {
    const response = await POST(
      new Request(`http://localhost/api/projects/${projectId}/cases`, {
        method: 'POST',
        headers: { 'content-type': contentType },
        body,
      }),
      context,
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects oversized and cross-site mutations before persistence', async () => {
    const oversized = await POST(
      new Request(`http://localhost/api/projects/${projectId}/cases`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(40 * 1024),
        },
        body: '{}',
      }),
      context,
    );
    expect(oversized.status).toBe(413);
    const crossSite = await POST(
      new Request(`http://localhost/api/projects/${projectId}/cases`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'sec-fetch-site': 'cross-site',
        },
        body: '{}',
      }),
      context,
    );
    expect(crossSite.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a malformed project identifier', async () => {
    const response = await POST(
      new Request('http://localhost/api/projects/not-a-uuid/cases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '검수 케이스', discipline: 'FIN' }),
      }),
      { params: Promise.resolve({ projectId: 'not-a-uuid' }) },
    );
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
