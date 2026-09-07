// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({ detail: vi.fn(), report: vi.fn() }));
vi.mock('@/lib/review/server', () => ({
  ReviewService: class {
    runDetail = mocks.detail;
  },
  reviewRequestSchema: {},
}));
vi.mock('@/lib/review/report', () => ({ exportReview: mocks.report }));
const projectId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';
const runId = '33333333-3333-4333-8333-333333333333';
const context = { params: Promise.resolve({ projectId }) };
const url = `http://localhost/api/projects/${projectId}/review?caseId=${caseId}&runId=${runId}&format=xlsx`;
const identity = {
  'oai-authenticated-user-id': 'owner',
  'oai-authenticated-user-email': 'authorized@example.com',
};

describe('private review report delivery', () => {
  beforeEach(() => {
    vi.stubEnv('LOCAL_DEMO_MODE', 'false');
    vi.stubEnv('APP_ALLOWED_EMAILS', 'authorized@example.com');
    vi.clearAllMocks();
    mocks.detail.mockResolvedValue({ run: { id: runId }, decisions: [] });
    mocks.report.mockReturnValue(new Uint8Array([80, 75, 3, 4]));
  });
  afterEach(() => vi.unstubAllEnvs());
  it('does not export before authentication', async () => {
    expect((await GET(new Request(url), context)).status).toBe(401);
    expect(mocks.detail).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it('downloads only the scoped frozen run with private response headers', async () => {
    const response = await GET(
      new Request(url, { headers: identity }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.detail.mock.calls[0]!.slice(1)).toEqual([
      projectId,
      caseId,
      runId,
    ]);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toContain(
      'attachment;',
    );
    expect(response.headers.get('content-type')).toContain(
      'spreadsheetml.sheet',
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([80, 75, 3, 4]),
    );
  });
  it('requires a valid run identifier instead of exporting live draft state', async () => {
    const response = await GET(
      new Request(url.replace(runId, 'draft'), { headers: identity }),
      context,
    );
    expect(response.status).toBe(400);
    expect(mocks.detail).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
});
