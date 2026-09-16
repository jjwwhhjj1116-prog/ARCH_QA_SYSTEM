import { z } from 'zod';
import { readUploadResponse } from './upload-response';

const transferSchema = z.object({
  uploadId: z.string(),
  offset: z.number().int().nonnegative(),
  sizeBytes: z.number().int().positive(),
  chunkBytes: z.literal(1048576),
  status: z.enum(['uploading', 'uploaded']),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .optional(),
});

export type TransferStatus = z.infer<typeof transferSchema>;

export class ResumableUploadError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly requestId = 'unavailable',
  ) {
    super(message);
    this.name = 'ResumableUploadError';
  }
}

/** Only server-acknowledged bytes count; retries never assume a PUT failed. */
export async function uploadResumable(
  uploadId: string,
  file: File,
  onProgress: (ack: number, total: number) => void,
  fetcher: typeof fetch = fetch,
): Promise<TransferStatus> {
  if (
    !uploadId ||
    !Number.isSafeInteger(file.size) ||
    file.size <= 0 ||
    file.size > 200 * 1024 * 1024
  )
    throw new ResumableUploadError(
      'UPLOAD_INVALID_FILE',
      '저장할 파일을 확인해 주세요.',
    );
  // Bind retries to the same original, even when another file has the same size.
  // Native digest runs outside Workers; no source buffer survives this await.
  let sha256: string;
  try {
    sha256 = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
      ),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
  } catch {
    throw new ResumableUploadError(
      'UPLOAD_DIGEST_FAILED',
      '원본 파일 확인에 실패했습니다. 파일을 다시 선택해 주세요.',
    );
  }
  const url = `/api/uploads/${encodeURIComponent(uploadId)}/transfer`;
  let acknowledged = 0;
  let ceiling = file.size; // The first POST may resume an earlier browser session.
  let recoveries = 0;
  let method: 'POST' | 'PUT' = 'POST';

  while (true) {
    const end = Math.min(acknowledged + 1048576, file.size);
    const init: RequestInit = {
      method,
      credentials: 'same-origin',
      headers: { 'Upload-Sha256': sha256 },
    };
    if (method === 'PUT') {
      ceiling = end;
      init.headers = {
        'Content-Type': 'application/octet-stream',
        'Upload-Offset': String(acknowledged),
        'Upload-Sha256': sha256,
      };
      init.body = file.slice(acknowledged, end);
    }

    let response: Response;
    try {
      response = await fetcher(url, init);
    } catch {
      if (recoveries++ < 2) {
        method = 'POST';
        continue;
      }
      throw new ResumableUploadError(
        'NETWORK_ERROR',
        '전송 상태를 확인하지 못했습니다. 파일을 다시 선택하여 이어서 저장하세요.',
      );
    }
    if (response.status === 503 && recoveries++ < 2) {
      method = 'POST';
      continue;
    }
    const envelope = await readUploadResponse(response);
    if ('error' in envelope)
      throw new ResumableUploadError(
        envelope.error.code,
        envelope.error.message,
        envelope.error.requestId,
      );
    const parsed = transferSchema.safeParse(envelope.data);
    if (!response.ok || !parsed.success)
      throw new ResumableUploadError(
        'UPLOAD_INVALID_RESPONSE',
        '전송 상태 응답을 확인하지 못했습니다.',
      );
    const state = parsed.data;
    if (
      state.uploadId !== uploadId ||
      state.sizeBytes !== file.size ||
      state.offset < acknowledged ||
      state.offset > ceiling ||
      (state.status === 'uploaded' && state.offset !== file.size) ||
      (method === 'PUT' && state.offset === acknowledged)
    )
      throw new ResumableUploadError(
        'UPLOAD_INVALID_OFFSET',
        '파일 크기 또는 전송 위치가 일치하지 않습니다. 저장 목록을 확인해 주세요.',
      );
    acknowledged = state.offset;
    onProgress(acknowledged, file.size);
    if (state.status === 'uploaded') return state;
    if (acknowledged === file.size) {
      if (recoveries++ >= 2)
        throw new ResumableUploadError(
          'UPLOAD_FINALIZATION_PENDING',
          '파일 전송은 완료했지만 저장 확인이 대기 중입니다. 다시 저장하면 확인을 이어갑니다.',
        );
      method = 'POST';
    } else method = 'PUT';
  }
}
