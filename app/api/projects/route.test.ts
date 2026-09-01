import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/projects/d1-repository', () => ({
  D1ProjectRepository: class {
    listForActor = vi.fn().mockResolvedValue([]);
    create = vi.fn().mockImplementation((record) =>
      Promise.resolve({
        id: record.id,
        code: record.code,
        name: record.name,
        clientName: record.clientName,
        status: 'active',
        role: record.role,
        openCaseCount: 0,
        needsAttentionCount: 0,
        createdAt: record.createdAt.toISOString(),
      }),
    );
  },
}));

const { POST } = await import('./route');

describe('projects API boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LOCAL_DEMO_MODE = 'true';
  });

  it('returns a bounded 400 envelope for malformed JSON', async () => {
    const response = await POST(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_JSON' },
    });
  });

  it('rejects cross-site mutation requests', async () => {
    const response = await POST(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'sec-fetch-site': 'cross-site',
        },
        body: '{}',
      }),
    );
    expect(response.status).toBe(403);
  });

  it('rejects oversized JSON before repository access', async () => {
    const response = await POST(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(40 * 1024),
        },
        body: '{}',
      }),
    );
    expect(response.status).toBe(413);
  });

  it('does not echo an unbounded request ID into the audit envelope', async () => {
    const response = await POST(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': '<script>'.repeat(50),
        },
        body: JSON.stringify({ code: 'P100', name: '경계 시험' }),
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/u);
  });
});
