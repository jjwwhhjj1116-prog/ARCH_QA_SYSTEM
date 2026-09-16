import { z } from 'zod';
import { DriveError } from './google-drive';

export const MAX_DRIVE_TRANSFER_BYTES = 200 * 1024 * 1024;
export const DRIVE_TRANSFER_CHUNK_BYTES = 1024 * 1024;
const endpoint = 'https://www.googleapis.com/upload/drive/v3/files';
const fields = 'id,size,mimeType,parents,appProperties,trashed,sha256Checksum';
const googleId = z.string().regex(/^[A-Za-z0-9_-]{10,200}$/u);
const objectSchema = z.object({
  id: googleId,
  folderId: googleId,
  connectionId: z.uuid(),
  keyHash: z.string().regex(/^[a-f0-9]{64}$/u),
  contentType: z
    .string()
    .max(120)
    .regex(/^[\w.+-]+\/[\w.+-]+$/u),
  size: z.number().int().min(1).max(MAX_DRIVE_TRANSFER_BYTES),
});
export type DriveTransferObject = z.infer<typeof objectSchema>;
export type DriveTransferMetadata = { sha256: string; size: number };
export type DriveTransferProgress =
  | { complete: false; offset: number }
  | { complete: true; offset: number; metadata: DriveTransferMetadata };

function invalid() {
  return new DriveError(
    'DRIVE_INVALID_RESPONSE',
    'Drive 전송 응답을 확인하지 못했습니다.',
    502,
  );
}
function session(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw invalid();
  }
  if (
    url.origin !== 'https://www.googleapis.com' ||
    url.pathname !== '/upload/drive/v3/files' ||
    url.username ||
    url.password ||
    url.hash ||
    !url.searchParams.get('upload_id')
  )
    throw invalid();
  return url.toString();
}
async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw invalid();
  const bytes = new Uint8Array(65536);
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > bytes.length) throw invalid();
      bytes.set(value, size);
      size += value.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)));
  } catch {
    await reader.cancel().catch(() => undefined);
    throw invalid();
  } finally {
    reader.releaseLock();
  }
}
function verify(
  value: unknown,
  object: DriveTransferObject,
): DriveTransferMetadata {
  const result = z
    .object({
      id: googleId,
      size: z.string().regex(/^\d+$/u),
      mimeType: z.string(),
      parents: z.array(googleId),
      trashed: z.boolean(),
      appProperties: z.record(z.string(), z.string()),
      sha256Checksum: z.string().optional(),
    })
    .safeParse(value);
  if (!result.success) throw invalid();
  const item = result.data;
  if (
    item.id !== object.id ||
    item.trashed ||
    Number(item.size) !== object.size ||
    item.mimeType !== object.contentType ||
    !item.parents.includes(object.folderId) ||
    item.appProperties.qcApp !== 'fin-rc-review-studio' ||
    item.appProperties.qcConnection !== object.connectionId ||
    item.appProperties.qcKey !== object.keyHash
  )
    throw new DriveError(
      'DRIVE_OBJECT_MISMATCH',
      '저장 파일의 계정·계보·크기를 확인하지 못했습니다.',
      409,
    );
  if (!item.sha256Checksum)
    throw new DriveError(
      'DRIVE_CHECKSUM_PENDING',
      '파일은 전송되었으나 Drive 무결성 확인이 대기 중입니다.',
      409,
    );
  if (!/^[a-f0-9]{64}$/u.test(item.sha256Checksum)) throw invalid();
  return { sha256: item.sha256Checksum, size: object.size };
}

// Session URLs and OAuth credentials stay server-side. No automatic retries:
// the caller owns the persisted lease and reconciles uncertain writes by probe.
export function driveTransfer(fetcher: typeof fetch, accessToken: string) {
  const token = z
    .string()
    .min(10)
    .max(4096)
    .regex(/^[\x21-\x7e]+$/u)
    .parse(accessToken);
  async function call<T>(
    url: string,
    init: RequestInit,
    consume: (r: Response) => Promise<T>,
    writing: boolean,
    resumable = false,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const response = await fetcher(url, {
        ...init,
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (
        !response.ok &&
        !(
          resumable &&
          response.status === 308 &&
          !response.headers.has('location')
        )
      ) {
        await response.body?.cancel();
        if (response.status === 404)
          throw new DriveError(
            resumable ? 'DRIVE_SESSION_EXPIRED' : 'DRIVE_NOT_FOUND',
            'Drive 전송 상태를 찾지 못했습니다. 다시 확인해 주세요.',
            404,
          );
        if (response.status === 401 || response.status === 403)
          throw new DriveError(
            'DRIVE_RECONNECT_REQUIRED',
            '관리자에게 Drive 연결 확인을 요청해 주세요.',
            401,
          );
        if (response.status === 429)
          throw new DriveError(
            'DRIVE_RATE_LIMITED',
            'Drive 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
            429,
          );
        throw new DriveError(
          'DRIVE_REQUEST_FAILED',
          'Drive 전송을 완료하지 못했습니다.',
          502,
          writing && response.status >= 500,
        );
      }
      return await consume(response);
    } catch (error) {
      if (error instanceof DriveError) {
        if (
          writing &&
          [
            'DRIVE_INVALID_RESPONSE',
            'DRIVE_OBJECT_MISMATCH',
            'DRIVE_CHECKSUM_PENDING',
          ].includes(error.code)
        )
          throw new DriveError(error.code, error.message, error.status, true);
        throw error;
      }
      throw new DriveError(
        'DRIVE_NETWORK_ERROR',
        'Drive 전송이 중단되었습니다. 저장 위치를 확인한 뒤 이어서 전송해 주세요.',
        502,
        writing,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  async function progress(
    response: Response,
    object: DriveTransferObject,
  ): Promise<DriveTransferProgress> {
    if (response.status === 308) {
      const range = response.headers.get('range');
      await response.body?.cancel();
      if (range === null) return { complete: false, offset: 0 };
      const match = /^bytes=0-(\d+)$/u.exec(range);
      const end = match ? Number(match[1]) : NaN;
      if (!Number.isSafeInteger(end) || end < 0 || end >= object.size - 1)
        throw invalid();
      return { complete: false, offset: end + 1 };
    }
    if (response.status !== 200 && response.status !== 201) throw invalid();
    return {
      complete: true,
      offset: object.size,
      metadata: verify(await boundedJson(response), object),
    };
  }
  return {
    async begin(input: DriveTransferObject): Promise<string> {
      const object = objectSchema.parse(input);
      return call(
        `${endpoint}?uploadType=resumable&fields=${fields}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': object.contentType,
            'X-Upload-Content-Length': String(object.size),
          },
          body: JSON.stringify({
            id: object.id,
            name: object.id,
            mimeType: object.contentType,
            parents: [object.folderId],
            appProperties: {
              qcApp: 'fin-rc-review-studio',
              qcConnection: object.connectionId,
              qcKey: object.keyHash,
            },
          }),
        },
        async (response) => {
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location) throw invalid();
          return session(location);
        },
        true,
      );
    },
    async probe(
      input: DriveTransferObject,
      sessionUrl: string,
    ): Promise<DriveTransferProgress> {
      const object = objectSchema.parse(input);
      return call(
        session(sessionUrl),
        {
          method: 'PUT',
          headers: {
            'Content-Length': '0',
            'Content-Range': `bytes */${object.size}`,
          },
        },
        (r) => progress(r, object),
        false,
        true,
      );
    },
    async send(
      input: DriveTransferObject,
      sessionUrl: string,
      offset: number,
      body: Uint8Array,
    ): Promise<DriveTransferProgress> {
      const object = objectSchema.parse(input);
      const url = session(sessionUrl);
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        body.byteLength < 1 ||
        body.byteLength > DRIVE_TRANSFER_CHUNK_BYTES ||
        offset + body.byteLength > object.size ||
        (offset + body.byteLength !== object.size &&
          body.byteLength % (256 * 1024) !== 0)
      )
        throw new DriveError(
          'DRIVE_CHUNK_INVALID',
          '전송 조각의 크기와 위치를 확인해 주세요.',
          400,
        );
      const bytes = new Uint8Array(body);
      return call(
        url,
        {
          method: 'PUT',
          headers: {
            'Content-Type': object.contentType,
            'Content-Length': String(bytes.byteLength),
            'Content-Range': `bytes ${offset}-${offset + bytes.byteLength - 1}/${object.size}`,
          },
          body: bytes,
        },
        (r) => progress(r, object),
        true,
        true,
      );
    },
    async metadata(input: DriveTransferObject): Promise<DriveTransferMetadata> {
      const object = objectSchema.parse(input);
      return call(
        `https://www.googleapis.com/drive/v3/files/${object.id}?fields=${fields}`,
        { method: 'GET' },
        async (r) => verify(await boundedJson(r), object),
        false,
      );
    },
  };
}
