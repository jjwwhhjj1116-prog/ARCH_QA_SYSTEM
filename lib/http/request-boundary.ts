const MAX_JSON_BYTES = 32 * 1024;
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,100}$/u;

export class RequestBoundaryError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function requestIdFrom(headers: Headers): string {
  const supplied = headers.get('x-request-id')?.trim();
  return supplied && REQUEST_ID_RE.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

export function assertSameSiteMutation(headers: Headers): void {
  if (headers.get('sec-fetch-site')?.toLowerCase() === 'cross-site') {
    throw new RequestBoundaryError(
      403,
      'CROSS_SITE_REQUEST_DENIED',
      '다른 사이트에서 보낸 변경 요청은 허용하지 않습니다.',
    );
  }
}

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) {
    throw new RequestBoundaryError(
      415,
      'JSON_REQUIRED',
      'JSON 형식의 요청만 허용합니다.',
    );
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    throw tooLarge();
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    throw tooLarge();
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestBoundaryError(
      400,
      'INVALID_JSON',
      'JSON 요청 본문을 확인해 주세요.',
    );
  }
}

export function runtimeMode(): 'production' | 'development' {
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

function tooLarge(): RequestBoundaryError {
  return new RequestBoundaryError(
    413,
    'REQUEST_TOO_LARGE',
    '요청 크기는 32KB를 넘을 수 없습니다.',
  );
}
