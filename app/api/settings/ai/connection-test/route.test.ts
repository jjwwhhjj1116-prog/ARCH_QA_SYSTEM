import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const ALLOWED_EMAIL = 'authorized@example.com';
const TEST_KEY = 'server-only-route-test-key';

function request(
  email = ALLOWED_EMAIL,
  extraHeaders: Record<string, string> = {},
): Request {
  return new Request('http://localhost/api/settings/ai/connection-test', {
    method: 'POST',
    headers: {
      'oai-authenticated-user-id': 'user-1',
      'oai-authenticated-user-email': email,
      ...extraHeaders,
    },
  });
}

describe('Gemini connection-test API', () => {
  beforeEach(() => {
    vi.stubEnv('LOCAL_DEMO_MODE', 'false');
    vi.stubEnv('APP_ALLOWED_EMAILS', ALLOWED_EMAIL);
    vi.stubEnv('GEMINI_API_KEY', TEST_KEY);
    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated, unapproved and cross-site callers before fetch', async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);

    expect(
      (
        await POST(
          new Request('http://localhost/api/settings/ai/connection-test', {
            method: 'POST',
          }),
        )
      ).status,
    ).toBe(401);
    expect((await POST(request('other@example.com'))).status).toBe(403);
    expect(
      (await POST(request(ALLOWED_EMAIL, { 'sec-fetch-site': 'cross-site' })))
        .status,
    ).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns an honest not-configured error without calling Gemini', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GEMINI_MODEL', '');
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);

    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AI_NOT_CONFIGURED' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('tests the configured model and returns no secret material', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({
      data: {
        provider: 'gemini',
        status: 'connected',
        model: 'gemini-2.5-flash',
      },
    });
    expect(JSON.stringify(body)).not.toContain(TEST_KEY);
  });

  it('does not expose the key or upstream response on provider failure', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(`invalid key ${TEST_KEY}`, { status: 401 }),
      );
    vi.stubGlobal('fetch', fetcher);

    const response = await POST(request());
    expect(response.status).toBe(502);
    const bodyText = await response.text();
    expect(bodyText).toContain('AI_AUTHENTICATION_FAILED');
    expect(bodyText).not.toContain(TEST_KEY);
    expect(bodyText).not.toContain('invalid key');
  });
});
