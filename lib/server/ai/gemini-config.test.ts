import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GeminiConfigurationError,
  GeminiConnectionError,
  geminiResponseError,
  getGeminiConfigurationStatus,
  testGeminiConnection,
  listGeminiModels,
} from './gemini-config';

const READY_ENV = {
  GEMINI_API_KEY: 'server-only-test-key',
  GEMINI_MODEL: 'gemini-2.5-flash',
};

describe('safe Google rejection reasons', () => {
  it.each([
    [
      503,
      'UNAVAILABLE',
      'The model is experiencing high demand.',
      'HIGH_DEMAND',
    ],
    [503, 'UNAVAILABLE', 'The model is overloaded.', 'HIGH_DEMAND'],
    [503, 'UNAVAILABLE', 'Temporary error', 'SERVICE_UNAVAILABLE'],
    [429, 'RESOURCE_EXHAUSTED', 'Quota exceeded', 'QUOTA_EXCEEDED'],
    [400, 'FAILED_PRECONDITION', 'Please enable billing', 'BILLING_REQUIRED'],
  ])(
    'preserves specific upstream reason %s %s',
    async (status, upstreamStatus, message, diagnostic) => {
      const error = await geminiResponseError(
        Response.json(
          {
            error: {
              status: upstreamStatus,
              message: `${message} ${READY_ENV.GEMINI_API_KEY}`,
            },
          },
          { status },
        ),
      );
      expect(error.diagnostic).toBe(`GOOGLE_${diagnostic}`);
      expect(error.message).not.toContain(READY_ENV.GEMINI_API_KEY);
    },
  );

  it('does not infer overload from status 503 alone', async () => {
    const error = await geminiResponseError(
      Response.json({ error: { message: 'unknown' } }, { status: 503 }),
    );
    expect(error.diagnostic).not.toBe('GOOGLE_HIGH_DEMAND');
  });

  it.each([
    ['API_KEY_INVALID', 'AI_AUTHENTICATION_FAILED', 'API_KEY_INVALID'],
    ['API_KEY_EXPIRED', 'AI_AUTHENTICATION_FAILED', 'API_KEY_EXPIRED'],
    ['SERVICE_BLOCKED', 'AI_PERMISSION_DENIED', 'SERVICE_BLOCKED'],
    ['API_KEY_SERVICE_BLOCKED', 'AI_PERMISSION_DENIED', 'SERVICE_BLOCKED'],
    ['HTTP_REFERRER_BLOCKED', 'AI_PERMISSION_DENIED', 'HTTP_REFERRER_BLOCKED'],
    [
      'API_KEY_HTTP_REFERRER_BLOCKED',
      'AI_PERMISSION_DENIED',
      'HTTP_REFERRER_BLOCKED',
    ],
    ['IP_ADDRESS_BLOCKED', 'AI_PERMISSION_DENIED', 'IP_ADDRESS_BLOCKED'],
    [
      'API_KEY_IP_ADDRESS_BLOCKED',
      'AI_PERMISSION_DENIED',
      'IP_ADDRESS_BLOCKED',
    ],
    ['CONSUMER_INVALID', 'AI_PERMISSION_DENIED', 'CONSUMER_INVALID'],
    ['SERVICE_DISABLED', 'AI_PERMISSION_DENIED', 'SERVICE_DISABLED'],
    [
      'ACCESS_TOKEN_TYPE_UNSUPPORTED',
      'AI_KEY_TYPE_UNSUPPORTED',
      'ACCESS_TOKEN_TYPE_UNSUPPORTED',
    ],
  ])(
    'classifies %s using fixed literals only',
    async (reason, code, diagnostic) => {
      const error = await geminiResponseError(
        Response.json(
          {
            error: {
              message: `private-message ${READY_ENV.GEMINI_API_KEY}`,
              details: [
                {
                  reason,
                  metadata: {
                    key: READY_ENV.GEMINI_API_KEY,
                    url: 'https://private.example',
                  },
                },
              ],
            },
          },
          { status: 400 },
        ),
      );
      expect(error).toMatchObject({
        code,
        diagnostic: `GOOGLE_${diagnostic}`,
        status: 502,
      });
      const serialized = JSON.stringify({
        code: error.code,
        diagnostic: error.diagnostic,
        message: error.message,
      });
      expect(serialized).not.toMatch(
        /private-message|server-only-test-key|private\.example|metadata/,
      );
    },
  );

  it.each([
    ['API key not valid. Please pass a valid API key.', 'API_KEY_INVALID'],
    [
      'User location is not supported for the API use.',
      'USER_LOCATION_UNSUPPORTED',
    ],
    [
      'Your API key was reported as leaked. Please use another API key.',
      'API_KEY_LEAKED',
    ],
  ])(
    'classifies a known message without returning it: %s',
    async (message, diagnostic) => {
      const error = await geminiResponseError(
        Response.json(
          {
            error: {
              message: `${message} ${READY_ENV.GEMINI_API_KEY} https://private.example`,
            },
          },
          { status: 400 },
        ),
      );
      expect(error.diagnostic).toBe(`GOOGLE_${diagnostic}`);
      expect(error.message).not.toContain(message);
      expect(
        JSON.stringify({
          code: error.code,
          diagnostic: error.diagnostic,
          message: error.message,
        }),
      ).not.toMatch(/server-only-test-key|private\.example/);
    },
  );

  it.each([
    {
      error: {
        message: READY_ENV.GEMINI_API_KEY,
        details: [{ reason: 'UNKNOWN_SECRET_REASON' }],
      },
    },
    {
      error: {
        details: [
          { reason: 'constructor' },
          { reason: { API_KEY_INVALID: true } },
          null,
        ],
      },
    },
    { error: { details: [{ metadata: { reason: 'API_KEY_INVALID' } }] } },
    { error: { message: 'API key not valid ' + 'x'.repeat(32768) } },
    null,
  ])(
    'retains generic HTTP fallback for unknown, malformed or oversized data',
    async (body) => {
      const error = await geminiResponseError(
        Response.json(body, { status: 400 }),
      );
      expect(error).toMatchObject({ code: 'AI_REQUEST_INVALID' });
      expect(error.diagnostic).toBeUndefined();
      expect(error.message).not.toMatch(
        /server-only-test-key|UNKNOWN_SECRET_REASON/,
      );
    },
  );
});

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

  it('checks model syntax without pretending a hardcoded list proves availability', () => {
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
      redirect: 'manual',
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
    [400, 'AI_REQUEST_INVALID', 502],
    [403, 'AI_PERMISSION_DENIED', 502],
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

describe('Gemini live model discovery', () => {
  afterEach(() => vi.useRealTimers());
  it.each([301, 302, 303, 307, 308])(
    'rejects redirect %s without following Location',
    async (status) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('private redirect body', {
          status,
          headers: { Location: 'https://foreign.example/private' },
        }),
      );
      const pending = listGeminiModels(READY_ENV.GEMINI_API_KEY, fetcher);
      await expect(pending).rejects.toMatchObject({
        code: 'AI_REDIRECT_DENIED',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual');
      await expect(pending).rejects.not.toThrow('private redirect body');
    },
  );
  it('uses workerd-compatible manual mode for discovery and model verification', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url, init) => {
        if (init?.redirect === 'error')
          throw new TypeError('Invalid redirect mode');
        return Response.json(
          (url as string).includes('?')
            ? {
                models: [
                  {
                    name: 'models/gemini-2.5-flash',
                    supportedGenerationMethods: ['generateContent'],
                  },
                ],
              }
            : {
                name: 'models/gemini-2.5-flash',
                supportedGenerationMethods: ['generateContent'],
              },
        );
      });
    expect(
      await listGeminiModels(READY_ENV.GEMINI_API_KEY, fetcher),
    ).toHaveLength(1);
    await expect(
      testGeminiConnection({
        environment: READY_ENV,
        fetcher,
        verifyResponse: true,
      }),
    ).resolves.toMatchObject({ status: 'connected' });
  });
  it('returns fixed diagnostic instead of raw runtime error', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(
        new TypeError(`Invalid redirect mode ${READY_ENV.GEMINI_API_KEY}`),
      );
    const pending = listGeminiModels(READY_ENV.GEMINI_API_KEY, fetcher);
    await expect(pending).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
      diagnostic: 'FETCH_REDIRECT_OPTION_INVALID',
    });
    await expect(pending).rejects.not.toThrow(READY_ENV.GEMINI_API_KEY);
  });
  it('reports unsupported Auth key types distinctly without exposing raw details', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            message: READY_ENV.GEMINI_API_KEY,
            details: [
              {
                reason: 'ACCESS_TOKEN_TYPE_UNSUPPORTED',
                metadata: { secret: READY_ENV.GEMINI_API_KEY },
              },
            ],
          },
        },
        { status: 401 },
      ),
    );
    const pending = listGeminiModels(READY_ENV.GEMINI_API_KEY, fetcher);
    await expect(pending).rejects.toMatchObject({
      code: 'AI_KEY_TYPE_UNSUPPORTED',
    });
    await expect(pending).rejects.not.toThrow(READY_ENV.GEMINI_API_KEY);
  });
  it('uses paginated official list and only returns generateContent Gemini IDs', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          models: [
            {
              name: 'models/gemini-synthetic-future',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-embedding',
              supportedGenerationMethods: ['embedContent'],
            },
            {
              name: 'models/../../metadata',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
          nextPageToken: 'page/2',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          models: [
            {
              name: 'models/gemini-synthetic-second',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        }),
      );
    expect(await listGeminiModels(READY_ENV.GEMINI_API_KEY, fetcher)).toEqual([
      { id: 'gemini-synthetic-future', label: 'gemini-synthetic-future' },
      { id: 'gemini-synthetic-second', label: 'gemini-synthetic-second' },
    ]);
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',
    );
    expect(
      new URL(fetcher.mock.calls[1][0] as string).searchParams.get('pageToken'),
    ).toBe('page/2');
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      headers: { 'x-goog-api-key': READY_ENV.GEMINI_API_KEY },
      redirect: 'manual',
      cache: 'no-store',
    });
    expect(fetcher.mock.calls[0][0] as string).not.toContain(
      READY_ENV.GEMINI_API_KEY,
    );
  });
  it('classifies invalid-key reason without returning raw provider text', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            message: `secret ${READY_ENV.GEMINI_API_KEY}`,
            details: [{ reason: 'API_KEY_INVALID' }],
          },
        },
        { status: 400 },
      ),
    );
    await expect(
      listGeminiModels(READY_ENV.GEMINI_API_KEY, fetcher),
    ).rejects.toMatchObject({ code: 'AI_AUTHENTICATION_FAILED' });
  });
  it.each([{ models: [], nextPageToken: 'repeat' }, { models: null }])(
    'rejects invalid or looping model lists',
    async (body) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => Response.json(body));
      await expect(
        listGeminiModels(READY_ENV.GEMINI_API_KEY, fetcher),
      ).rejects.toMatchObject({ code: 'AI_RESPONSE_INVALID' });
      expect(fetcher.mock.calls.length).toBeLessThanOrEqual(2);
    },
  );
  it('bounds response data and never returns HTML/error text', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('s'.repeat(1024 * 1024 + 1)));
    await expect(
      listGeminiModels(READY_ENV.GEMINI_API_KEY, fetcher),
    ).rejects.toMatchObject({ code: 'AI_RESPONSE_INVALID' });
  });
  it('bounds response reading time as well as initial fetch', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener('abort', () =>
                controller.error(new DOMException('aborted', 'AbortError')),
              );
            },
          }),
        ),
    );
    const checked = expect(
      listGeminiModels(READY_ENV.GEMINI_API_KEY, fetcher),
    ).rejects.toMatchObject({ code: 'AI_CONNECTION_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(8000);
    await checked;
  });
});
