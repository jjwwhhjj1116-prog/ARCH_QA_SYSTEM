import { z } from 'zod';

// Adapted from the user's Claim Center TEST-SERVER integration. No shared
// credentials, folders or database records are imported from that application.
export const QC_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const QC_DRIVE_DEFAULT_ACCOUNT = 'concost.dt@gmail.com';
const api = 'https://www.googleapis.com/drive/v3';
const uploadApi = 'https://www.googleapis.com/upload/drive/v3/files';
const tokenUrl = 'https://oauth2.googleapis.com/token';
const encoder = new TextEncoder();
const googleId = z.string().regex(/^[A-Za-z0-9_-]{10,200}$/u);
const opaque = z.uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const credential = z
  .string()
  .min(10)
  .max(4096)
  .regex(/^[\x21-\x7e]+$/u);
export type DriveFetch = typeof fetch;

export class DriveError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
    readonly uncertain = false,
  ) {
    super(message);
  }
}

function malformed() {
  return new DriveError(
    'DRIVE_INVALID_RESPONSE',
    'Google Drive 응답을 확인하지 못했습니다.',
  );
}

// Bound both the response body and its reading time. Provider errors are never
// echoed: they may contain credentials, file names or customer content.
async function json(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw malformed();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) throw malformed();
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    await reader.cancel().catch(() => undefined);
    throw malformed();
  } finally {
    reader.releaseLock();
  }
}

async function call<T>(
  fetcher: DriveFetch,
  url: string,
  init: RequestInit,
  consume: (response: Response) => Promise<T>,
  writing = false,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetcher(url, {
      ...init,
      // Workers supports manual, not error. Non-2xx is rejected below without
      // following Location or forwarding credentials to another endpoint.
      redirect: 'manual',
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 404)
        throw new DriveError(
          'DRIVE_NOT_FOUND',
          'Drive에서 파일을 찾지 못했습니다.',
          404,
        );
      if (response.status === 409)
        throw new DriveError(
          'DRIVE_ALREADY_EXISTS',
          'Drive에 같은 파일 ID가 있습니다. 저장 상태를 확인합니다.',
          409,
          writing,
        );
      if (
        response.status === 401 ||
        response.status === 403 ||
        (url === tokenUrl && response.status === 400)
      ) {
        throw new DriveError(
          'DRIVE_RECONNECT_REQUIRED',
          'Drive 권한을 확인하고 계정을 다시 연결해 주세요.',
          401,
        );
      }
      if (response.status === 429) {
        throw new DriveError(
          'DRIVE_RATE_LIMITED',
          'Drive 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
          429,
        );
      }
      throw new DriveError(
        'DRIVE_REQUEST_FAILED',
        'Drive 요청을 완료하지 못했습니다.',
        502,
        writing && response.status >= 500,
      );
    }
    return await consume(response);
  } catch (error) {
    if (error instanceof DriveError) {
      if (
        writing &&
        (error.code === 'DRIVE_INVALID_RESPONSE' ||
          error.code === 'DRIVE_OBJECT_MISMATCH')
      ) {
        throw new DriveError(error.code, error.message, error.status, true);
      }
      throw error;
    }
    throw new DriveError(
      'DRIVE_NETWORK_ERROR',
      'Drive 연결이 중단되었습니다. 연결 상태를 다시 확인해 주세요.',
      502,
      writing,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function digest(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(value)),
  );
}
function base64url(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}
export async function createDriveAuthorization(input: {
  clientId: string;
  redirectUri: string;
  expectedEmail: string;
}) {
  const clientId = z
    .string()
    .regex(/^[\w.-]+\.apps\.googleusercontent\.com$/u)
    .parse(input.clientId);
  const redirect = new URL(input.redirectUri);
  if (
    redirect.protocol !== 'https:' ||
    redirect.username ||
    redirect.password ||
    redirect.search ||
    redirect.hash
  ) {
    throw new DriveError(
      'DRIVE_CALLBACK_INVALID',
      'HTTPS 콜백 주소를 확인해 주세요.',
      400,
    );
  }
  const expectedEmail = z
    .email()
    .max(254)
    .parse(input.expectedEmail.trim().toLowerCase());
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const stateHash = [...(await digest(state))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect.toString(),
    response_type: 'code',
    scope: QC_DRIVE_SCOPE,
    state,
    code_challenge: base64url(await digest(verifier)),
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'select_account consent',
    login_hint: expectedEmail,
  }).toString();
  // Caller must encrypt verifier and persist actor-bound, one-use stateHash
  // with expiry before exposing url; never return verifier to a browser.
  return { url: url.toString(), stateHash, verifier, expectedEmail };
}

const tokenSchema = z.object({
  access_token: credential,
  token_type: z.literal('Bearer'),
  refresh_token: credential.optional(),
  scope: z.string().max(4096).optional(),
});
export async function requestDriveToken(
  fetcher: DriveFetch,
  input: {
    clientId: string;
    clientSecret: string;
  } & (
    | { code: string; verifier: string; redirectUri: string }
    | { refreshToken: string }
  ),
) {
  const params = new URLSearchParams({
    client_id: credential.parse(input.clientId),
    client_secret: credential.parse(input.clientSecret),
  });
  const exchange = 'code' in input;
  if (exchange) {
    params.set('grant_type', 'authorization_code');
    params.set('code', credential.parse(input.code));
    params.set(
      'code_verifier',
      z
        .string()
        .regex(/^[\w-]{43,128}$/u)
        .parse(input.verifier),
    );
    params.set('redirect_uri', z.url().parse(input.redirectUri));
  } else {
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', credential.parse(input.refreshToken));
  }
  return call(
    fetcher,
    tokenUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    },
    async (response) => {
      const parsed = tokenSchema.safeParse(await json(response));
      if (!parsed.success) throw malformed();
      if (
        exchange &&
        (!parsed.data.refresh_token ||
          !parsed.data.scope?.split(/\s+/u).includes(QC_DRIVE_SCOPE))
      ) {
        throw new DriveError(
          'DRIVE_CONSENT_REQUIRED',
          'Drive 파일 접근에 동의하고 다시 연결해 주세요.',
          403,
        );
      }
      return {
        accessToken: parsed.data.access_token,
        refreshToken: parsed.data.refresh_token,
      };
    },
  );
}

export async function verifyDriveAccount(
  fetcher: DriveFetch,
  accessToken: string,
  expectedEmail: string,
) {
  const expected = z.email().parse(expectedEmail.trim().toLowerCase());
  return call(
    fetcher,
    `${api}/about?fields=user(emailAddress,displayName),storageQuota(limit,usage,usageInDrive,usageInDriveTrash)`,
    {
      headers: { Authorization: `Bearer ${credential.parse(accessToken)}` },
    },
    async (response) => {
      const decimal = z.string().regex(/^\d+$/u);
      const parsed = z
        .object({
          user: z.object({
            emailAddress: z.email(),
            displayName: z.string().max(200).optional(),
          }),
          storageQuota: z
            .object({
              limit: decimal.optional(),
              usage: decimal.optional(),
              usageInDrive: decimal.optional(),
              usageInDriveTrash: decimal.optional(),
            })
            .optional(),
        })
        .safeParse(await json(response));
      if (!parsed.success) throw malformed();
      if (parsed.data.user.emailAddress.toLowerCase() !== expected) {
        throw new DriveError(
          'DRIVE_ACCOUNT_MISMATCH',
          '선택한 Google 계정이 지정한 저장 계정과 다릅니다. 기존 연결은 유지됩니다.',
          409,
        );
      }
      // Missing limit means unavailable/unlimited, never zero or an assumed 10GB.
      return { email: expected, quota: parsed.data.storageQuota ?? null };
    },
  );
}

const objectSchema = z.object({
  id: googleId,
  folderId: googleId,
  connectionId: opaque,
  keyHash: hash,
  sha256: hash,
  size: z
    .number()
    .int()
    .min(1)
    .max(32 * 1024 * 1024),
  contentType: z
    .string()
    .regex(/^[\w.+-]+\/[\w.+-]+$/u)
    .max(120),
});
export type DriveObject = z.infer<typeof objectSchema>;
const metadataFields =
  'id,size,mimeType,parents,appProperties,trashed,sha256Checksum';
function verifyMetadata(value: unknown, input: DriveObject) {
  const result = z
    .object({
      id: googleId,
      size: z.string().regex(/^\d+$/u),
      mimeType: z.string(),
      parents: z.array(googleId),
      appProperties: z.record(z.string(), z.string()),
      sha256Checksum: z.string().optional(),
      trashed: z.boolean(),
    })
    .safeParse(value);
  if (!result.success) throw malformed();
  const item = result.data;
  if (
    item.id !== input.id ||
    item.trashed ||
    Number(item.size) !== input.size ||
    item.mimeType !== input.contentType ||
    !item.parents.includes(input.folderId) ||
    item.appProperties.qcConnection !== input.connectionId ||
    item.appProperties.qcKey !== input.keyHash ||
    (item.appProperties.sha256 === undefined &&
      item.sha256Checksum === undefined) ||
    (item.appProperties.sha256 !== undefined &&
      item.appProperties.sha256 !== input.sha256) ||
    (item.sha256Checksum !== undefined &&
      item.sha256Checksum !== input.sha256) ||
    item.appProperties.qcApp !== 'fin-rc-review-studio'
  ) {
    throw new DriveError(
      'DRIVE_OBJECT_MISMATCH',
      '저장 파일의 계정·계보·해시를 확인하지 못했습니다.',
      409,
    );
  }
}

export function driveFiles(fetcher: DriveFetch, accessToken: string) {
  const authorization = {
    Authorization: `Bearer ${credential.parse(accessToken)}`,
  };
  return {
    async createFolder(input: { id: string; connectionId: string }) {
      const id = googleId.parse(input.id);
      const connectionId = opaque.parse(input.connectionId);
      return call(
        fetcher,
        `${api}/files?fields=id,mimeType,appProperties,trashed`,
        {
          method: 'POST',
          headers: { ...authorization, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            name: 'CONCOST QC - 검수 자료',
            mimeType: 'application/vnd.google-apps.folder',
            appProperties: {
              qcApp: 'fin-rc-review-studio',
              qcConnection: connectionId,
            },
          }),
        },
        async (response) => {
          const parsed = z
            .object({
              id: z.literal(id),
              mimeType: z.literal('application/vnd.google-apps.folder'),
              trashed: z.literal(false),
              appProperties: z.object({
                qcApp: z.literal('fin-rc-review-studio'),
                qcConnection: z.literal(connectionId),
              }),
            })
            .safeParse(await json(response));
          if (!parsed.success) throw malformed();
          return id;
        },
        true,
      );
    },
    async allocateId() {
      return call(
        fetcher,
        `${api}/files/generateIds?count=1&space=drive&type=files`,
        { headers: authorization },
        async (response) => {
          const parsed = z
            .object({ ids: z.array(googleId).length(1) })
            .safeParse(await json(response));
          if (!parsed.success) throw malformed();
          return parsed.data.ids[0];
        },
      );
    },
    async verify(input: DriveObject) {
      const object = objectSchema.parse(input);
      await call(
        fetcher,
        `${api}/files/${object.id}?fields=${metadataFields}`,
        { headers: authorization },
        async (response) => verifyMetadata(await json(response), object),
      );
    },
    async download(input: DriveObject) {
      const object = objectSchema.parse(input);
      await this.verify(object);
      return call(
        fetcher,
        `${api}/files/${object.id}?alt=media`,
        { headers: authorization },
        async (response) => {
          const reader = response.body?.getReader();
          if (!reader) throw malformed();
          const bytes = new Uint8Array(object.size);
          let offset = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (offset + value.byteLength > object.size) throw malformed();
              bytes.set(value, offset);
              offset += value.byteLength;
            }
            if (offset !== object.size) throw malformed();
            const digestBytes = new Uint8Array(
              await crypto.subtle.digest('SHA-256', bytes),
            );
            const actualHash = [...digestBytes]
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('');
            if (actualHash !== object.sha256)
              throw new DriveError(
                'DRIVE_CONTENT_MISMATCH',
                '파일 내용이 저장 당시 해시와 다릅니다. 원본을 다시 확인해 주세요.',
                409,
              );
            return bytes;
          } catch (error) {
            await reader.cancel().catch(() => undefined);
            throw error;
          } finally {
            reader.releaseLock();
          }
        },
      );
    },
    async upload(input: DriveObject, body: Uint8Array) {
      const object = objectSchema.parse(input);
      // Snapshot only the view, never the entire backing buffer.
      const bytes = new Uint8Array(body);
      const digestBytes = new Uint8Array(
        await crypto.subtle.digest('SHA-256', bytes),
      );
      const actualHash = [...digestBytes]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (bytes.byteLength !== object.size || actualHash !== object.sha256) {
        throw new DriveError(
          'DRIVE_INPUT_MISMATCH',
          '파일 크기 또는 해시가 일치하지 않습니다.',
          409,
        );
      }
      // Persist allocated ID + connection BEFORE this call. Unknown outcomes
      // must reconcile this same ID, not allocate another or overwrite a file.
      const session = await call(
        fetcher,
        `${uploadApi}?uploadType=resumable&fields=${metadataFields}`,
        {
          method: 'POST',
          headers: {
            ...authorization,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': object.contentType,
            'X-Upload-Content-Length': String(object.size),
          },
          body: JSON.stringify({
            id: object.id,
            name: object.id,
            parents: [object.folderId],
            mimeType: object.contentType,
            appProperties: {
              qcApp: 'fin-rc-review-studio',
              qcConnection: object.connectionId,
              qcKey: object.keyHash,
              sha256: object.sha256,
            },
          }),
        },
        async (response) => {
          const location = response.headers.get('Location');
          await response.body?.cancel();
          if (!location) throw malformed();
          const url = new URL(location);
          // Never send OAuth credentials/bytes to a provider-supplied foreign URL.
          if (
            url.origin !== 'https://www.googleapis.com' ||
            url.pathname !== '/upload/drive/v3/files' ||
            url.username ||
            url.password ||
            url.hash ||
            !url.searchParams.has('upload_id')
          )
            throw malformed();
          return url.toString();
        },
        true,
      );
      await call(
        fetcher,
        session,
        {
          method: 'PUT',
          headers: {
            ...authorization,
            'Content-Type': object.contentType,
            'Content-Length': String(object.size),
          },
          body: bytes,
        },
        async (response) => verifyMetadata(await json(response), object),
        true,
      );
    },
  };
}
