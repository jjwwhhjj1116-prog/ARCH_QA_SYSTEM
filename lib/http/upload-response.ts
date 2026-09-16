import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
} from '@/lib/domain/contracts';
import type { StoredUploadSummary } from '@/lib/ingestion/repository';

// Platform-generated 503/413/429 pages are not JSON and are not network failures.
export async function readUploadResponse<T = StoredUploadSummary>(
  response: Response,
): Promise<ApiSuccessEnvelope<T> | ApiErrorEnvelope> {
  try {
    const body = (await response.json()) as
      | ApiSuccessEnvelope<T>
      | ApiErrorEnvelope;
    if (body && typeof body === 'object' && ('error' in body || 'data' in body))
      return body;
  } catch {
    /* Return safe status guidance; never render the raw platform page. */
  }
  const status = response.status;
  const requestId =
    response.headers.get('x-request-id') ??
    response.headers.get('cf-ray') ??
    '';
  return {
    error: {
      code: response.ok ? 'UPLOAD_INVALID_RESPONSE' : `UPLOAD_HTTP_${status}`,
      message:
        status === 503
          ? '서버에서 파일 처리가 중단되었습니다(HTTP 503). 처리 한도·서버 상태 확인이 필요합니다. 저장된 파일은 유지됩니다.'
          : status === 413
            ? '서버의 업로드 크기 제한을 초과했습니다(HTTP 413).'
            : status === 429
              ? '서버 요청 한도에 도달했습니다(HTTP 429). 잠시 후 실패한 파일만 다시 저장하세요.'
              : `파일 저장 응답을 확인하지 못했습니다(HTTP ${status}). 저장 목록 확인 후 실패한 파일만 다시 저장하세요.`,
      requestId: /^[A-Za-z0-9._:-]{1,100}$/u.test(requestId)
        ? requestId
        : 'unavailable',
    },
  };
}
