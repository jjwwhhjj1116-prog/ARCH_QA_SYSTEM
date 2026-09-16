import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { sqliteD1 } from '../../../../../tests/helpers/sqlite-d1';
import {
  personalSettings,
  decryptKey,
} from '@/lib/server/ai/personal-settings';
import {
  COMPANY_AI_SUBJECT,
  getCompanyGeminiConfig,
} from '@/lib/server/ai/company-settings';
const binding = vi.hoisted(() => ({ db: null as D1Database | null }));
vi.mock('@/db', () => ({ getD1Binding: () => binding.db }));
vi.mock('@/lib/server/ai/regional-fetch', () => ({
  regionalGeminiFetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, init),
}));
import { GET, PUT, POST, PATCH, DELETE } from './route';
let fixture: ReturnType<typeof sqliteD1>;
const secret = '12'.repeat(32),
  key = 'synthetic-company-api-key-not-real';
const req = (
  method: string,
  body?: unknown,
  email = 'yjw@con-cost.com',
  extra = {},
) =>
  new Request('http://localhost/api/settings/ai/company', {
    method,
    headers: {
      origin: 'http://localhost',
      'content-type': 'application/json',
      'oai-authenticated-user-id': 'admin-a',
      'oai-authenticated-user-email': email,
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
beforeEach(() => {
  fixture = sqliteD1();
  binding.db = fixture.db;
  vi.stubEnv('LOCAL_DEMO_MODE', 'false');
  vi.stubEnv('EMPLOYEE_LOGIN_ENABLED', 'false');
  vi.stubEnv(
    'APP_ALLOWED_EMAILS',
    'yjw@con-cost.com,yjpark@con-cost.com,employee@example.com,jy04210810@gmail.com',
  );
  vi.stubEnv('AI_SETTINGS_ENCRYPTION_KEY', secret);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () =>
      Response.json({
        name: 'models/gemini-synthetic',
        supportedGenerationMethods: ['generateContent'],
      }),
    ),
  );
});
afterEach(() => {
  vi.useRealTimers();
  fixture.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('company API boundaries', () => {
  it('ends the generation probe even if the transport ignores abort', async () => {
    await personalSettings(fixture.db, COMPANY_AI_SUBJECT, secret).save({
      version: 0,
      apiKey: key,
      model: 'gemini-synthetic',
    });
    vi.useFakeTimers();
    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const pending = POST(
      req('POST', { action: 'probe-generation', version: 1 }),
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(60_001);
    expect(await (await pending).json()).toMatchObject({
      data: {
        completed: false,
        code: 'GENERATION_TIMEOUT',
        httpStatus: null,
      },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it('probes actual generation with the saved company key, no prompt/key input, no mutation or retry', async () => {
    await personalSettings(fixture.db, COMPANY_AI_SUBJECT, secret).save({
      version: 0,
      apiKey: key,
      model: 'gemini-synthetic',
    });
    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json(
        { error: { message: `unavailable ${key}` } },
        { status: 503, headers: { 'x-qc-gemini-response': 'upstream' } },
      ),
    );
    const response = await POST(
      req('POST', { action: 'probe-generation', version: 1 }),
    );
    const text = await response.text();
    expect(text).not.toContain(key);
    expect(JSON.parse(text).data).toMatchObject({
      completed: false,
      httpStatus: 503,
      origin: 'GOOGLE_HTTP_RESPONSE',
      model: 'gemini-synthetic',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-synthetic:generateContent',
    );
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe(key);
    expect(JSON.parse(init?.body as string)).toEqual({
      contents: [{ parts: [{ text: 'Reply with OK only.' }] }],
      generationConfig: { maxOutputTokens: 64 },
    });
    expect((await getCompanyGeminiConfig(fixture.db, secret)).version).toBe(1);
    expect(
      (await POST(req('POST', { action: 'probe-generation', version: 0 })))
        .status,
    ).toBe(409);
    expect(
      (
        await POST(
          req('POST', {
            action: 'probe-generation',
            version: 1,
            prompt: 'untrusted',
          }),
        )
      ).status,
    ).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }),
    );
    expect(
      await (
        await POST(req('POST', { action: 'probe-generation', version: 1 }))
      ).json(),
    ).toMatchObject({ data: { completed: true } });
  });
  it.each(['employee@example.com', 'jy04210810@gmail.com'])(
    'denies every action for %s',
    async (email) => {
      for (const [method, handler] of Object.entries({
        GET,
        POST,
        PUT,
        PATCH,
        DELETE,
      }))
        expect(
          (await handler(req(method, method === 'GET' ? undefined : {}, email)))
            .status,
        ).toBe(403);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('rejects anonymous and cross origin promotion', async () => {
    expect(
      (await GET(new Request('http://localhost/api/settings/ai/company')))
        .status,
    ).toBe(401);
    expect(
      (
        await PATCH(
          req('PATCH', {}, undefined, { origin: 'https://evil.example' }),
        )
      ).status,
    ).toBe(403);
  });
  it('promotes only own verified key with new AAD, retains personal key, never calls provider', async () => {
    await personalSettings(fixture.db, 'admin-a', secret).save({
      version: 0,
      apiKey: key,
      model: 'gemini-synthetic',
    });
    vi.mocked(fetch).mockClear();
    expect(await (await GET(req('GET'))).json()).toMatchObject({
      data: { canPromotePersonal: true },
    });
    const response = await PATCH(
      req('PATCH', { action: 'promote-personal', version: 0 }),
    );
    expect(response.status).toBe(200);
    const promoted = await response.text();
    expect(promoted).not.toContain(key);
    expect(JSON.parse(promoted)).toMatchObject({
      data: { canPromotePersonal: false },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(await getCompanyGeminiConfig(fixture.db, secret)).toEqual({
      apiKey: key,
      model: 'gemini-synthetic',
      version: 1,
    });
    const row = fixture.sqlite
      .prepare('SELECT encrypted_key FROM personal_ai_settings WHERE subject=?')
      .get(COMPANY_AI_SUBJECT) as { encrypted_key: string };
    await expect(
      decryptKey(row.encrypted_key, 'admin-a', secret),
    ).rejects.toThrow();
    expect(
      (await personalSettings(fixture.db, 'admin-a', secret).status())
        .configured,
    ).toBe(true);
    expect(
      (await PATCH(req('PATCH', { action: 'promote-personal', version: 1 })))
        .status,
    ).toBe(409);
  });
  it('requires own configuration and rejects source injection', async () => {
    expect(await (await GET(req('GET'))).json()).toMatchObject({
      data: { canPromotePersonal: false },
    });
    expect(
      (await PATCH(req('PATCH', { action: 'promote-personal', version: 0 })))
        .status,
    ).toBe(409);
    expect(
      (
        await PATCH(
          req('PATCH', {
            action: 'promote-personal',
            version: 0,
            subject: 'other',
          }),
        )
      ).status,
    ).toBe(400);
    await expect(
      getCompanyGeminiConfig(fixture.db, secret),
    ).rejects.toMatchObject({ code: 'COMPANY_AI_NOT_CONFIGURED' });
  });
  it('allows second admin status and supports save/disconnect with stale-write rejection', async () => {
    expect(
      (
        await PUT(
          req('PUT', { version: 0, apiKey: key, model: 'gemini-synthetic' }),
        )
      ).status,
    ).toBe(200);
    expect(
      await (await GET(req('GET', undefined, 'yjpark@con-cost.com'))).json(),
    ).toMatchObject({ data: { configured: true, version: 1 } });
    expect(
      (await DELETE(req('DELETE', { version: 1, confirm: true }))).status,
    ).toBe(200);
    await expect(
      getCompanyGeminiConfig(fixture.db, secret),
    ).rejects.toMatchObject({ code: 'COMPANY_AI_NOT_CONFIGURED' });
    expect(
      (
        await PUT(
          req('PUT', { version: 1, apiKey: key, model: 'gemini-synthetic' }),
        )
      ).status,
    ).toBe(409);
  });
});
