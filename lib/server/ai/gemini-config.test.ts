import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GeminiConfigurationError,
  GeminiConnectionError,
  getGeminiConfigurationStatus,
  testGeminiConnection,
} from './gemini-config';

const READY_ENV = {
  GEMINI_API_KEY: 'server-only-test-key',
  GEMINI_MODEL: 'gemini-2.5-flash',
};

describe('Gemini server configuration', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reports a truthful not-configured state without exposing a key field', () => {
    const result = getGeminiConfigurationStatus({
      GEMINI_MODEL: 'gemini-2.5-flash',
    });
    expect(result).toMatchObject({
      provider: 'gemini',
      status: 'not_configured',
      configured: false,
      model: 'gemini-2.5-flash',
    });
    expect(JSON.stringify(result)).not.toContain('apiKey');
    expect(JSON.stringify(result)).not.toContain('server-only-test-key');
  });

  it('accepts only the explicit model allowlist', () => {
    expect(getGeminiConfigurationStatus(READY_ENV)).toMatchObject({
      status: 'ready',
      configured: true,
      model: 'gemini-2.5-flash',
    });
    expect(
      getGeminiConfigurationStatus({
        GEMINI_API_KEY: 'test-key',
        GEMINI_MODEL: '../../metadata',
      }),
    ).toMatchObject({
      status: 'invalid_configuration',
      configured: false,
      model: null,
    });
  });

  it('uses one fixed Google endpoint with the key only in a request header', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    await expect(
      testGeminiConnection({ environment: READY_ENV, fetcher }),
    ).resolves.toEqual({
      provider: 'gemini',
      status: 'connected',
      model: 'gemini-2.5-flash',
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash',
    );
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      headers: { 'x-goog-api-key': READY_ENV.GEMINI_API_KEY },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not call the provider when configuration is missing or invalid', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      testGeminiConnection({ environment: {}, fetcher }),
    ).rejects.toMatchObject({
      code: 'AI_NOT_CONFIGURED',
    } satisfies Partial<GeminiConfigurationError>);
    await expect(
      testGeminiConnection({
        environment: {
          GEMINI_API_KEY: 'test-key',
          GEMINI_MODEL: 'not-allowed',
        },
        fetcher,
      }),
    ).rejects.toMatchObject({
      code: 'AI_CONFIGURATION_INVALID',
    } satisfies Partial<GeminiConfigurationError>);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'AI_AUTHENTICATION_FAILED', 502],
    [403, 'AI_AUTHENTICATION_FAILED', 502],
    [404, 'AI_MODEL_UNAVAILABLE', 502],
    [429, 'AI_RATE_LIMITED', 429],
    [500, 'AI_PROVIDER_UNAVAILABLE', 502],
  ] as const)(
    'maps upstream status %s to a safe application error',
    async (upstreamStatus, code, status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('upstream-secret-detail', { status: upstreamStatus }),
        );
      const promise = testGeminiConnection({
        environment: READY_ENV,
        fetcher,
      });
      await expect(promise).rejects.toMatchObject({
        code,
        status,
      } satisfies Partial<GeminiConnectionError>);
      await expect(promise).rejects.not.toThrow('upstream-secret-detail');
    },
  );

  it('enforces the connection timeout', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const promise = testGeminiConnection({
      environment: READY_ENV,
      fetcher,
    });
    const expectation = expect(promise).rejects.toMatchObject({
      code: 'AI_CONNECTION_TIMEOUT',
      status: 504,
    });
    await vi.advanceTimersByTimeAsync(8_000);
    await expectation;
  });
});
