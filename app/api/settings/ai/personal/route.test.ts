import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { sqliteD1 } from '../../../../../tests/helpers/sqlite-d1';
const binding = vi.hoisted(() => ({ db: null as D1Database | null }));
vi.mock('@/db', () => ({ getD1Binding: () => binding.db }));
import { GET, PUT, DELETE } from './route';
let fixture: ReturnType<typeof sqliteD1>;
const key = 'synthetic-api-key-not-a-secret';
function req(method = 'GET', body?: unknown, subject = 'alice', extra = {}) {
  return new Request('http://localhost/api/settings/ai/personal', {
    method,
    headers: {
      origin: 'http://localhost',
      'content-type': 'application/json',
      'oai-authenticated-user-id': subject,
      'oai-authenticated-user-email': 'reviewer@example.com',
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => {
  fixture = sqliteD1();
  binding.db = fixture.db;
  vi.stubEnv('LOCAL_DEMO_MODE', 'false');
  vi.stubEnv('APP_ALLOWED_EMAILS', 'reviewer@example.com');
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
  it('allows a non-admin to manage only their own credential, returns no key, and requires deletion confirmation', async () => {
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
