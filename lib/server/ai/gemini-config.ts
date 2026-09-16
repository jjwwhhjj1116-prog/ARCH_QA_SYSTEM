const GEMINI_API_ORIGIN = 'https://generativelanguage.googleapis.com';
const GEMINI_API_VERSION = 'v1beta';
const GEMINI_CONNECTION_TIMEOUT_MS = 8_000;

export const GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
] as const;

// Syntax is a boundary check, not an assertion that a model exists. Google
// models.list / models.get are authoritative for availability with this key.
export const isGeminiModelId = (value: string) =>
  /^gemini-[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(value);
export type GeminiModel = { id: string; label: string };

export type GeminiConfigurationStatus = {
  provider: 'gemini';
  status: 'ready' | 'not_configured' | 'invalid_configuration';
  configured: boolean;
  model: string | null;
  availableModels: ReadonlyArray<{ id: string; label: string }>;
};

export type GeminiConnectionResult = {
  provider: 'gemini';
  status: 'connected';
  model: string;
};

type GeminiConfiguration = {
  apiKey: string;
  model: string;
};

type Environment = Readonly<Record<string, string | undefined>>;

export class GeminiConfigurationError extends Error {
  constructor(
    message: string,
    readonly code: 'AI_NOT_CONFIGURED' | 'AI_CONFIGURATION_INVALID',
  ) {
    super(message);
  }
}

export class GeminiConnectionError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'AI_AUTHENTICATION_FAILED'
      | 'AI_KEY_TYPE_UNSUPPORTED'
      | 'AI_PERMISSION_DENIED'
      | 'AI_REQUEST_INVALID'
      | 'AI_RESPONSE_INVALID'
      | 'AI_REDIRECT_DENIED'
      | 'AI_MODEL_UNAVAILABLE'
      | 'AI_RATE_LIMITED'
      | 'AI_PROVIDER_UNAVAILABLE'
      | 'AI_CONNECTION_TIMEOUT',
    readonly status: 429 | 502 | 504,
    readonly diagnostic?:
      | ReturnType<typeof safeFetchDiagnostic>
      | `GOOGLE_${keyof typeof GOOGLE_ERROR_REASONS}`,
  ) {
    super(message);
  }
}

export function getGeminiConfigurationStatus(
  environment: Environment = process.env,
): GeminiConfigurationStatus {
  const apiKey = environment.GEMINI_API_KEY?.trim() ?? '';
  const rawModel = environment.GEMINI_MODEL?.trim() ?? '';
  const modelAllowed = isGeminiModelId(rawModel);

  let status: GeminiConfigurationStatus['status'];
  if (!apiKey) {
    status = 'not_configured';
  } else if (!apiKey || !modelAllowed) {
    status = 'invalid_configuration';
  } else {
    status = 'ready';
  }

  return {
    provider: 'gemini',
    status,
    configured: status === 'ready',
    model: modelAllowed ? rawModel : null,
    availableModels: GEMINI_MODELS,
  };
}

export async function testGeminiConnection(
  options: {
    environment?: Environment;
    fetcher?: typeof fetch;
    verifyResponse?: boolean;
  } = {},
): Promise<GeminiConnectionResult> {
  const configuration = requireGeminiConfiguration(
    options.environment ?? process.env,
  );
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    GEMINI_CONNECTION_TIMEOUT_MS,
  );

  try {
    const response = await (options.fetcher ?? fetch)(
      `${GEMINI_API_ORIGIN}/${GEMINI_API_VERSION}/models/${encodeURIComponent(configuration.model)}`,
      {
        method: 'GET',
        headers: { 'x-goog-api-key': configuration.apiKey },
        signal: controller.signal,
        // Workerd accepts manual/follow, not redirect:'error'. Manual plus
        // explicit 3xx rejection never forwards the credential to a redirect.
        redirect: 'manual',
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      throw await geminiResponseError(response);
    }

    if (options.verifyResponse) {
      const metadata = (await readGeminiJson(response)) as {
        name?: unknown;
        supportedGenerationMethods?: unknown;
      };
      if (
        !metadata ||
        metadata.name !== `models/${configuration.model}` ||
        !Array.isArray(metadata.supportedGenerationMethods) ||
        !metadata.supportedGenerationMethods.includes('generateContent')
      )
        throw upstreamError(404);
    }

    return {
      provider: 'gemini',
      status: 'connected',
      model: configuration.model,
    };
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      throw new GeminiConnectionError(
        'Gemini 연결 확인 시간이 초과되었습니다.',
        'AI_CONNECTION_TIMEOUT',
        504,
      );
    }
    if (error instanceof GeminiConnectionError) throw error;
    throw new GeminiConnectionError(
      'Gemini 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      'AI_PROVIDER_UNAVAILABLE',
      502,
      safeFetchDiagnostic(error),
    );
  } finally {
    clearTimeout(timeout);
  }
}

function requireGeminiConfiguration(
  environment: Environment,
): GeminiConfiguration {
  const status = getGeminiConfigurationStatus(environment);
  if (status.status === 'not_configured') {
    throw new GeminiConfigurationError(
      'Gemini 서버 설정이 아직 구성되지 않았습니다.',
      'AI_NOT_CONFIGURED',
    );
  }
  if (status.status !== 'ready' || !status.model) {
    throw new GeminiConfigurationError(
      'Gemini 서버 설정을 확인해 주세요.',
      'AI_CONFIGURATION_INVALID',
    );
  }
  return {
    apiKey: environment.GEMINI_API_KEY!.trim(),
    model: status.model,
  };
}

function upstreamError(status: number): GeminiConnectionError {
  if (status === 401) {
    return new GeminiConnectionError(
      'Gemini 인증 설정을 확인해 주세요.',
      'AI_AUTHENTICATION_FAILED',
      502,
    );
  }
  if (status === 403)
    return new GeminiConnectionError(
      'Gemini 접근 권한이 없습니다. Google AI Studio의 키 제한·프로젝트 API 사용 설정을 확인해 주세요.',
      'AI_PERMISSION_DENIED',
      502,
    );
  if (status === 400)
    return new GeminiConnectionError(
      'Google이 연결 요청을 거부했습니다. 키 제한과 선택한 모델을 확인해 주세요.',
      'AI_REQUEST_INVALID',
      502,
    );
  if (status === 404) {
    return new GeminiConnectionError(
      '선택한 Gemini 모델을 이 키로 사용할 수 없습니다. 사용 가능한 모델 조회 후 다시 선택해 주세요.',
      'AI_MODEL_UNAVAILABLE',
      502,
    );
  }
  if (status === 429) {
    return new GeminiConnectionError(
      'Gemini 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
      'AI_RATE_LIMITED',
      429,
    );
  }
  return new GeminiConnectionError(
    'Gemini 서비스 응답을 확인하지 못했습니다.',
    'AI_PROVIDER_UNAVAILABLE',
    502,
  );
}

const GOOGLE_ERROR_REASONS = {
  HIGH_DEMAND: [
    'AI_PROVIDER_UNAVAILABLE',
    'Google 오류 본문이 해당 모델의 높은 수요 또는 과부하를 명시했습니다.',
  ],
  SERVICE_UNAVAILABLE: [
    'AI_PROVIDER_UNAVAILABLE',
    'Google 오류 본문의 상태가 UNAVAILABLE입니다. 더 구체적인 과부하 원인은 제공되지 않았습니다.',
  ],
  QUOTA_EXCEEDED: [
    'AI_RATE_LIMITED',
    'Google 오류 본문이 할당량 소진을 명시했습니다. 해당 프로젝트의 사용 한도를 확인해야 합니다.',
  ],
  BILLING_REQUIRED: [
    'AI_PERMISSION_DENIED',
    'Google 오류 본문이 결제 활성화 또는 결제 상태 확인을 요구했습니다.',
  ],
  API_KEY_INVALID: [
    'AI_AUTHENTICATION_FAILED',
    'Google이 API 키를 유효하지 않은 키로 판단했습니다. Google AI Studio에서 발급한 키를 다시 확인해 주세요.',
  ],
  API_KEY_EXPIRED: [
    'AI_AUTHENTICATION_FAILED',
    'Google API 키가 만료되었습니다. Google AI Studio에서 새 키를 발급하고 다시 저장해 주세요.',
  ],
  SERVICE_BLOCKED: [
    'AI_PERMISSION_DENIED',
    'API 키의 서비스 제한으로 Gemini 접근이 차단되었습니다. 키의 Generative Language API 허용 설정을 확인해 주세요.',
  ],
  HTTP_REFERRER_BLOCKED: [
    'AI_PERMISSION_DENIED',
    'API 키의 웹사이트 제한으로 서버 요청이 차단되었습니다. 이 앱은 서버에서 Gemini를 호출하므로 서버용 키 제한 설정을 확인해 주세요.',
  ],
  IP_ADDRESS_BLOCKED: [
    'AI_PERMISSION_DENIED',
    'API 키의 IP 주소 제한으로 서버 요청이 차단되었습니다. Google Cloud의 키 제한 설정을 확인해 주세요.',
  ],
  CONSUMER_INVALID: [
    'AI_PERMISSION_DENIED',
    'API 키에 연결된 Google Cloud 프로젝트를 사용할 수 없습니다. 프로젝트 상태와 키 소속을 확인해 주세요.',
  ],
  SERVICE_DISABLED: [
    'AI_PERMISSION_DENIED',
    '키에 연결된 Google Cloud 프로젝트에서 Gemini API가 비활성화되어 있습니다. Generative Language API 사용 설정을 확인해 주세요.',
  ],
  ACCESS_TOKEN_TYPE_UNSUPPORTED: [
    'AI_KEY_TYPE_UNSUPPORTED',
    'Google이 이 키의 인증 유형을 지원하지 않는다고 응답했습니다. Google AI Studio에서 해당 프로젝트의 Auth 키 상태와 API 사용 설정을 확인해 주세요.',
  ],
  USER_LOCATION_UNSUPPORTED: [
    'AI_PERMISSION_DENIED',
    'Google이 요청 위치를 지원하지 않는다고 응답했습니다. 서버 실행 지역과 Gemini 지원 지역을 확인해 주세요.',
  ],
  API_KEY_LEAKED: [
    'AI_AUTHENTICATION_FAILED',
    'Google이 유출 신고된 API 키를 차단했습니다. 해당 키를 폐기하고 새 키를 발급하여 저장해 주세요.',
  ],
} as const;

// Inspect only bounded known reasons and message patterns; never echo messages,
// headers or the raw response (which may repeat a supplied credential).
export async function geminiResponseError(response: Response) {
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined);
    return new GeminiConnectionError(
      'Google이 다른 주소로 이동을 요청하여 보안을 위해 연결을 중단했습니다.',
      'AI_REDIRECT_DENIED',
      502,
    );
  }
  try {
    const body = (await readGeminiJson(response)) as {
      error?: { details?: unknown; message?: unknown; status?: unknown };
    };
    const details = body?.error?.details;
    let reason: keyof typeof GOOGLE_ERROR_REASONS | undefined;
    if (Array.isArray(details)) {
      for (const item of details) {
        if (
          !item ||
          typeof item !== 'object' ||
          typeof item.reason !== 'string'
        )
          continue;
        // Google also prefixes the three application/service restriction reasons.
        const candidate = item.reason.replace(
          /^API_KEY_(?=SERVICE_BLOCKED$|HTTP_REFERRER_BLOCKED$|IP_ADDRESS_BLOCKED$)/u,
          '',
        );
        if (Object.hasOwn(GOOGLE_ERROR_REASONS, candidate)) {
          reason = candidate as keyof typeof GOOGLE_ERROR_REASONS;
          break;
        }
      }
    }
    const message = body?.error?.message;
    if (!reason && typeof message === 'string') {
      if (/API key was reported as leaked/iu.test(message))
        reason = 'API_KEY_LEAKED';
      else if (/API key not valid/iu.test(message)) reason = 'API_KEY_INVALID';
      else if (/User location is not supported/iu.test(message))
        reason = 'USER_LOCATION_UNSUPPORTED';
      else if (
        response.status === 503 &&
        /high demand|overload|exhausted.*capacity|capacity.*exhausted/iu.test(
          message,
        )
      )
        reason = 'HIGH_DEMAND';
      else if (
        response.status === 429 &&
        /quota|rate limit|resource.*exhaust/iu.test(message)
      )
        reason = 'QUOTA_EXCEEDED';
      else if (
        [400, 403].includes(response.status) &&
        /enable billing|billing.*disabled|billing.*required|set up.*billing/iu.test(
          message,
        )
      )
        reason = 'BILLING_REQUIRED';
    }
    if (
      !reason &&
      response.status === 503 &&
      body?.error?.status === 'UNAVAILABLE'
    )
      reason = 'SERVICE_UNAVAILABLE';
    if (reason) {
      const [code, message] = GOOGLE_ERROR_REASONS[reason];
      return new GeminiConnectionError(message, code, 502, `GOOGLE_${reason}`);
    }
  } catch {
    /* HTTP status still provides a safe fallback classification. */
  }
  return upstreamError(response.status);
}

export async function readGeminiJson(
  response: Response,
  maxBytes = 32768,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader)
    throw new GeminiConnectionError(
      'Google 응답 형식을 확인하지 못했습니다.',
      'AI_RESPONSE_INVALID',
      502,
    );
  const decoder = new TextDecoder();
  let raw = '',
    size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('response limit');
      raw += decoder.decode(value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode());
  } catch {
    await reader.cancel().catch(() => undefined);
    throw new GeminiConnectionError(
      'Google 응답 형식을 확인하지 못했습니다. 잠시 후 다시 조회해 주세요.',
      'AI_RESPONSE_INVALID',
      502,
    );
  } finally {
    reader.releaseLock();
  }
}

export async function listGeminiModels(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<GeminiModel[]> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    GEMINI_CONNECTION_TIMEOUT_MS,
  );
  const models = new Map<string, GeminiModel>();
  let pageToken = '';
  const seen = new Set<string>();
  try {
    for (let page = 0; page < 10; page++) {
      const url = new URL(`${GEMINI_API_ORIGIN}/${GEMINI_API_VERSION}/models`);
      url.searchParams.set('pageSize', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await fetcher(url.toString(), {
        headers: { 'x-goog-api-key': apiKey },
        cache: 'no-store',
        redirect: 'manual',
        signal: controller.signal,
      });
      if (!response.ok) throw await geminiResponseError(response);
      const body = (await readGeminiJson(response, 1024 * 1024)) as {
        models?: unknown;
        nextPageToken?: unknown;
      };
      if (!body || !Array.isArray(body.models) || body.models.length > 100)
        throw new GeminiConnectionError(
          '모델 목록 응답을 확인하지 못했습니다.',
          'AI_RESPONSE_INVALID',
          502,
        );
      for (const item of body.models) {
        if (!item || typeof item !== 'object') continue;
        const model = item as {
          name?: unknown;
          supportedGenerationMethods?: unknown;
        };
        const id =
          typeof model.name === 'string' && model.name.startsWith('models/')
            ? model.name.slice(7)
            : '';
        if (
          isGeminiModelId(id) &&
          Array.isArray(model.supportedGenerationMethods) &&
          model.supportedGenerationMethods.includes('generateContent')
        )
          models.set(id, { id, label: id });
      }
      if (!body.nextPageToken) {
        if (!models.size) throw upstreamError(404);
        return [...models.values()];
      }
      if (
        typeof body.nextPageToken !== 'string' ||
        body.nextPageToken.length > 2048 ||
        seen.has(body.nextPageToken)
      )
        break;
      pageToken = body.nextPageToken;
      seen.add(pageToken);
    }
    throw new GeminiConnectionError(
      '모델 목록을 모두 확인하지 못했습니다. 다시 조회해 주세요.',
      'AI_RESPONSE_INVALID',
      502,
    );
  } catch (error) {
    if (controller.signal.aborted)
      throw new GeminiConnectionError(
        'Gemini 모델 조회 시간이 초과되었습니다.',
        'AI_CONNECTION_TIMEOUT',
        504,
      );
    if (error instanceof GeminiConnectionError) throw error;
    throw new GeminiConnectionError(
      'Google 모델 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      'AI_PROVIDER_UNAVAILABLE',
      502,
      safeFetchDiagnostic(error),
    );
  } finally {
    clearTimeout(timer);
  }
}

// Literal diagnostics only: error messages/stacks may contain request secrets.
function safeFetchDiagnostic(error: unknown) {
  if (!(error instanceof Error)) return 'FETCH_UNKNOWN_ERROR' as const;
  if (/illegal invocation/i.test(error.message))
    return 'FETCH_ILLEGAL_INVOCATION' as const;
  if (
    /redirect/i.test(error.message) &&
    /invalid|unsupported/i.test(error.message)
  )
    return 'FETCH_REDIRECT_OPTION_INVALID' as const;
  if (
    /cache/i.test(error.message) &&
    /invalid|unsupported/i.test(error.message)
  )
    return 'FETCH_CACHE_OPTION_INVALID' as const;
  if (error instanceof TypeError) return 'FETCH_TYPE_ERROR' as const;
  return 'FETCH_NETWORK_ERROR' as const;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}
