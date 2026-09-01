import { RequestBoundaryError } from './request-boundary';

export async function readBoundedBytes(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RequestBoundaryError(
      500,
      'UPLOAD_LIMIT_INVALID',
      '업로드 크기 제한이 올바르지 않습니다.',
    );
  }
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/octet-stream')) {
    throw new RequestBoundaryError(
      415,
      'BINARY_BODY_REQUIRED',
      '파일 바이트는 application/octet-stream으로 보내야 합니다.',
    );
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw tooLarge(maxBytes);
  }
  if (!request.body) {
    throw new RequestBoundaryError(400, 'FILE_EMPTY', '파일 내용이 없습니다.');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw tooLarge(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) {
    throw new RequestBoundaryError(400, 'FILE_EMPTY', '파일 내용이 없습니다.');
  }
  const snapshot = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    snapshot.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return snapshot;
}

function tooLarge(maxBytes: number): RequestBoundaryError {
  return new RequestBoundaryError(
    413,
    'FILE_TOO_LARGE',
    `파일은 선언 크기 ${maxBytes}바이트를 초과할 수 없습니다.`,
  );
}
