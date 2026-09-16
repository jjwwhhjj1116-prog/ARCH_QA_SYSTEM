import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { sqliteD1 } from '../../../../../tests/helpers/sqlite-d1';
const binding = vi.hoisted(() => ({ db: null as D1Database | null }));
vi.mock('@/db', () => ({ getD1Binding: () => binding.db }));
vi.mock('@/lib/server/ai/regional-fetch', () => ({
  regionalGeminiFetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, init),
}));
import { GET, PUT, POST, DELETE } from './route';
let fixture: ReturnType<typeof sqliteD1>;
const key = 'synthetic-api-key-not-a-secret';
function req(method = 'GET', body?: unknown, subject = 'alice', extra = {}) {
  return new Request('http://localhost/api/settings/ai/personal', {
    method,
    headers: {
      origin: 'http://localhost',
      'content-type': 'application/json',
      'oai-authenticated-user-id': subject,
      'oai-authenticated-user-email':
        subject === 'bob' ? 'yjpark@con-cost.com' : 'yjw@con-cost.com',
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => {
  fixture = sqliteD1();
  binding.db = fixture.db;
  vi.stubEnv('LOCAL_DEMO_MODE', 'false');
  vi.stubEnv(
    'APP_ALLOWED_EMAILS',
    'yjw@con-cost.com,yjpark@con-cost.com,reviewer@example.com,jy04210810@gmail.com',
  );
  vi.stubEnv('EMPLOYEE_LOGIN_ENABLED', 'false');
  vi.stubEnv('AI_SETTINGS_ENCRYPTION_KEY', '12'.repeat(32));
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        name: 'models/gemini-3.7-flash',
        supportedGenerationMethods: ['generateContent'],
      }),
    ),
  );
});
afterEach(() => {
  fixture.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('personal settings API authorization and boundaries', () => {
  it.each(['reviewer@example.com', 'jy04210810@gmail.com'])(
    'rejects non-admin %s for every operation without provider calls or writes',
    async (email) => {
      for (const [method, handler] of Object.entries({
        GET,
        POST,
        PUT,
        DELETE,
      })) {
        const response = await handler(
          req(
            method,
            method === 'GET'
              ? undefined
              : {
                  version: 0,
                  apiKey: key,
                  model: 'gemini-3.7-flash',
                  confirm: true,
                },
            'employee',
            { 'oai-authenticated-user-email': email },
          ),
        );
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({
          error: { code: 'ADMIN_REQUIRED' },
        });
      }
      expect(fetch).not.toHaveBeenCalled();
      expect(
        fixture.sqlite
          .prepare('SELECT count(*) AS n FROM personal_ai_settings')
          .get()?.n,
      ).toBe(0);
    },
  );
  it('discovers provider models with a draft key without persisting it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        models: [
          {
            name: 'models/gemini-synthetic-new',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      }),
    );
    const response = await POST(req('POST', { version: 0, apiKey: key }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { availableModels: [{ id: 'gemini-synthetic-new' }] },
    });
    expect(
      fixture.sqlite
        .prepare('SELECT count(*) AS n FROM personal_ai_settings')
        .get()?.n,
    ).toBe(0);
  });
  it('uses only the authenticated actor saved key for discovery and rejects forged owner/CSRF', async () => {
    expect(
      (
        await PUT(
          req('PUT', { version: 0, model: 'gemini-3.7-flash', apiKey: key }),
        )
      ).status,
    ).toBe(200);
    vi.mocked(fetch).mockClear();
    expect((await POST(req('POST', { version: 0 }, 'bob'))).status).toBe(400);
    expect(
      (await POST(req('POST', { version: 1, owner: 'alice' }, 'bob'))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          req('POST', { version: 1 }, 'alice', {
            origin: 'https://evil.example',
          }),
        )
      ).status,
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        models: [
          {
            name: 'models/gemini-synthetic-new',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      }),
    );
    expect((await POST(req('POST', { version: 1 }))).status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { 'x-goog-api-key': key } }),
    );
  });
  it('does not overwrite saved configuration when the selected model becomes unavailable', async () => {
    expect(
      (
        await PUT(
          req('PUT', { version: 0, model: 'gemini-3.7-flash', apiKey: key }),
        )
      ).status,
    ).toBe(200);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('provider-secret-details', { status: 404 }),
    );
    const response = await PUT(
      req('PUT', { version: 1, model: 'gemini-synthetic-new' }),
    );
    const text = await response.text();
    expect(text).toContain('AI_MODEL_UNAVAILABLE');
    expect(text).not.toContain('provider-secret-details');
    expect(await (await GET(req())).json()).toMatchObject({
      data: { version: 1, model: 'gemini-3.7-flash' },
    });
  });
  it('verifies and saves a dotted auth key without returning it', async () => {
    const authKey = `AQ.${'a'.repeat(300)}._-`;
    const response = await PUT(
      req('PUT', { version: 0, model: 'gemini-3.7-flash', apiKey: authKey }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(authKey);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { 'x-goog-api-key': authKey } }),
    );
  });
  it('identifies invalid fields without echoing submitted secrets', async () => {
    const invalid = 'AQ.secret with whitespace';
    const response = await PUT(
      req('PUT', { version: 0, model: 'gemini-3.7-flash', apiKey: invalid }),
    );
    const body = (await response.json()) as {
      error: { fields: { apiKey: string } };
    };
    expect(response.status).toBe(400);
    expect(body.error.fields.apiKey).toContain('20~512');
    expect(JSON.stringify(body)).not.toContain(invalid);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects missing identity and cross-site mutations', async () => {
    expect(
      (await GET(new Request('http://localhost/api/settings/ai/personal')))
        .status,
    ).toBe(401);
    expect(
      (await PUT(req('PUT', {}, 'alice', { origin: 'https://evil.example' })))
        .status,
    ).toBe(403);
  });
  it('allows an admin to manage only their own credential, returns no key, and requires deletion confirmation', async () => {
    const response = await PUT(
      req('PUT', { version: 0, model: 'gemini-3.7-flash', apiKey: key }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(key);
    expect(
      await (await GET(req('GET', undefined, 'bob'))).json(),
    ).toMatchObject({ data: { configured: false } });
    expect((await DELETE(req('DELETE', { version: 1 }))).status).toBe(400);
    expect(
      (await DELETE(req('DELETE', { version: 1, confirm: true }))).status,
    ).toBe(200);
    expect(await (await GET(req())).json()).toMatchObject({
      data: { configured: false, version: 2 },
    });
  });
  it('rejects owner injection and excessive input before calling the provider', async () => {
    expect(
      (
        await PUT(
          req('PUT', {
            version: 0,
            model: 'gemini-3.7-flash',
            owner: 'bob',
            apiKey: key,
          }),
        )
      ).status,
    ).toBe(400);
    expect((await PUT(req('PUT', { padding: 'x'.repeat(40000) }))).status).toBe(
      413,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
