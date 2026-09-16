// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { forwardGemini } from './gemini-outbound';

const origin = 'https://generativelanguage.googleapis.com';
function request(path = '/v1beta/models', method = 'GET', body?: BodyInit) {
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      'x-goog-api-key': 'SYNTHETIC-KEY',
      cookie: 'SECRET-COOKIE',
      authorization: 'Bearer SECRET-AUTH',
      'x-private': 'SECRET-HEADER',
    },
    ...(method === 'POST' ? { body } : {}),
  });
}

describe('private Gemini outbound boundary', () => {
  it.each([
    ['/v1beta/models?pageSize=100&pageToken=next', 'GET', undefined],
    ['/v1beta/models/gemini-2.5-flash', 'GET', undefined],
    ['/v1beta/models/gemini-2.5-flash:generateContent', 'POST', '{}'],
  ] as const)(
    'forwards allowed %s exactly once with only required headers',
    async (path, method, body) => {
      const send = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ synthetic: true }));
      const response = await forwardGemini(request(path, method, body), send);
      expect(response.status).toBe(200);
      expect(response.headers.get('x-qc-gemini-response')).toBe('upstream');
      expect(send).toHaveBeenCalledTimes(1);
      const [url, init] = send.mock.calls[0];
      expect(url).toBe(`${origin}${path}`);
      expect(init).toMatchObject({
        method,
        redirect: 'manual',
        cache: 'no-store',
      });
      expect(init?.headers).toEqual({
        'x-goog-api-key': 'SYNTHETIC-KEY',
        'content-type': 'application/json',
      });
      expect(JSON.stringify(init)).not.toMatch(
        /SECRET-COOKIE|SECRET-AUTH|SECRET-HEADER/,
      );
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    },
  );

  it.each([
    ['https://evil.example/v1beta/models', 'GET'],
    ['http://generativelanguage.googleapis.com/v1beta/models', 'GET'],
    [`${origin}:444/v1beta/models`, 'GET'],
    [`${origin}/v1beta/files`, 'GET'],
    [`${origin}/v1beta/models/gemini-test:streamGenerateContent`, 'POST'],
    [`${origin}/v1beta/models/gemini-test:generateContent`, 'GET'],
    [`${origin}/v1beta/models?key=SECRET`, 'GET'],
    [`${origin}/v1beta/models?url=https://evil.example`, 'GET'],
    [`${origin}/v1beta/models`, 'DELETE'],
  ])(
    'rejects disallowed target/method %s %s before sending',
    async (url, method) => {
      const send = vi.fn<typeof fetch>();
      const result = await forwardGemini(
        new Request(url, {
          method,
          headers: { 'x-goog-api-key': 'synthetic' },
        }),
        send,
      );
      expect(result.status).toBe(400);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each(['', 'x'.repeat(513)])(
    'rejects absent or oversized keys',
    async (key) => {
      const send = vi.fn<typeof fetch>();
      const input = request();
      input.headers.set('x-goog-api-key', key);
      expect((await forwardGemini(input, send)).status).toBe(400);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each([65536, 65537])(
    'enforces streamed body bound at %i bytes',
    async (size) => {
      const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
      const result = await forwardGemini(
        request(
          '/v1beta/models/gemini-test:generateContent',
          'POST',
          'x'.repeat(size),
        ),
        send,
      );
      expect(result.status).toBe(size === 65536 ? 200 : 413);
      expect(send).toHaveBeenCalledTimes(size === 65536 ? 1 : 0);
    },
  );

  it('rejects missing POST body', async () => {
    const send = vi.fn<typeof fetch>();
    expect(
      (
        await forwardGemini(
          request('/v1beta/models/gemini-test:generateContent', 'POST'),
          send,
        )
      ).status,
    ).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([302, 429, 500])(
    'never follows redirects or retries status %i',
    async (status) => {
      const send = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          status,
          headers: { location: 'https://evil.example' },
        }),
      );
      expect((await forwardGemini(request(), send)).status).toBe(status);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][1]?.redirect).toBe('manual');
    },
  );
});
