const GEMINI_API_ORIGIN = 'https://generativelanguage.googleapis.com';
const GEMINI_API_VERSION = 'v1beta';
const GEMINI_CONNECTION_TIMEOUT_MS = 8_000;

export const GEMINI_MODELS = [
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
] as const;

const GEMINI_MODEL_IDS = new Set<string>(GEMINI_MODELS.map(({ id }) => id));

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
      | 'AI_MODEL_UNAVAILABLE'
      | 'AI_RATE_LIMITED'
      | 'AI_PROVIDER_UNAVAILABLE'
      | 'AI_CONNECTION_TIMEOUT',
    readonly status: 429 | 502 | 504,
  ) {
    super(message);
  }
}

export function getGeminiConfigurationStatus(
  environment: Environment = process.env,
): GeminiConfigurationStatus {
  const apiKey = environment.GEMINI_API_KEY?.trim() ?? '';
  const rawModel = environment.GEMINI_MODEL?.trim() ?? '';
  const modelAllowed = GEMINI_MODEL_IDS.has(rawModel);

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
        redirect: 'error',
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      throw upstreamError(response.status);
    }

    return {
      provider: 'gemini',
      status: 'connected',
      model: configuration.model,
    };
  } catch (error) {
    if (error instanceof GeminiConnectionError) throw error;
    if (isAbortError(error) || controller.signal.aborted) {
      throw new GeminiConnectionError(
        'Gemini 연결 확인 시간이 초과되었습니다.',
        'AI_CONNECTION_TIMEOUT',
        504,
      );
    }
    throw new GeminiConnectionError(
      'Gemini 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      'AI_PROVIDER_UNAVAILABLE',
      502,
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
  if (status === 401 || status === 403) {
    return new GeminiConnectionError(
      'Gemini 인증 설정을 확인해 주세요.',
      'AI_AUTHENTICATION_FAILED',
      502,
    );
  }
  if (status === 404) {
    return new GeminiConnectionError(
      '설정된 Gemini 모델을 사용할 수 없습니다.',
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}
