import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const ALLOWED_EMAIL = 'authorized@example.com';

function request(email = ALLOWED_EMAIL): Request {
  return new Request('http://localhost/api/settings/ai', {
    headers: {
      'oai-authenticated-user-id': 'user-1',
      'oai-authenticated-user-email': email,
    },
  });
}

describe('AI settings status API', () => {
  beforeEach(() => {
    vi.stubEnv('LOCAL_DEMO_MODE', 'false');
    vi.stubEnv('APP_ALLOWED_EMAILS', ALLOWED_EMAIL);
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GEMINI_MODEL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires a platform identity and the application allowlist', async () => {
    const unauthenticated = await GET(
      new Request('http://localhost/api/settings/ai'),
    );
    expect(unauthenticated.status).toBe(401);

    const denied = await GET(request('other@example.com'));
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: 'ACCOUNT_NOT_ALLOWED' },
    });
  });

  it('reports missing server configuration honestly without key material', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({
      data: {
        provider: 'gemini',
        status: 'not_configured',
        configured: false,
        model: null,
      },
    });
    expect(JSON.stringify(body)).not.toContain('GEMINI_API_KEY');
    expect(JSON.stringify(body)).not.toContain('apiKey');
  });

  it('returns only safe readiness metadata for a configured provider', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'do-not-return-this-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-flash');
    const response = await GET(request());
    const body = await response.json();
    expect(body).toMatchObject({
      data: {
        provider: 'gemini',
        status: 'ready',
        configured: true,
        model: 'gemini-2.5-flash',
      },
    });
    expect(JSON.stringify(body)).not.toContain('do-not-return-this-key');
  });
});
