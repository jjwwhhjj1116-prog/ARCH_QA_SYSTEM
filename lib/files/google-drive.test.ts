// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { driveTransfer } from './drive-transfer';
import {
  createDriveAuthorization,
  driveFiles,
  QC_DRIVE_SCOPE,
  requestDriveToken,
  verifyDriveAccount,
  type DriveObject,
} from './google-drive';

const token = 'synthetic-access-token';
const connectionId = '11111111-1111-4111-8111-111111111111';
const bytes = new Uint8Array([1, 2, 3]);
const sha256 =
  '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81';
const object: DriveObject = {
  id: 'syntheticFile123',
  folderId: 'syntheticFolder123',
  connectionId,
  keyHash: 'a'.repeat(64),
  sha256,
  size: 3,
  contentType: 'application/octet-stream',
};
const metadata = {
  id: object.id,
  size: '3',
  mimeType: object.contentType,
  parents: [object.folderId],
  trashed: false,
  appProperties: {
    qcApp: 'fin-rc-review-studio',
    qcConnection: connectionId,
    qcKey: object.keyHash,
    sha256,
  },
};
const response = (value: unknown, status = 200) =>
  Response.json(value, { status });

describe('QC Google Drive authorization', () => {
  it('rejects redirects without forwarding credentials on Workers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: 'https://attacker.example' },
      }),
    );
    await expect(
      verifyDriveAccount(fetcher, token, 'concost.dt@gmail.com'),
    ).rejects.toMatchObject({ code: 'DRIVE_REQUEST_FAILED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual');
  });
  it('uses account chooser and least privilege with independent PKCE states', async () => {
    const input = {
      clientId: '123-test.apps.googleusercontent.com',
      redirectUri: 'https://qc.example/api/drive/callback',
      expectedEmail: 'concost.dt@gmail.com',
    };
    const first = await createDriveAuthorization(input);
    const second = await createDriveAuthorization({
      ...input,
      expectedEmail: 'replacement@example.com',
    });
    const url = new URL(first.url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')).toBe(QC_DRIVE_SCOPE);
    expect(url.searchParams.get('prompt')).toBe('select_account consent');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(first.stateHash).not.toBe(second.stateHash);
    expect(first.verifier).not.toBe(second.verifier);
    expect(first.url).not.toContain(first.verifier);
    expect(new URL(second.url).searchParams.get('login_hint')).toBe(
      'replacement@example.com',
    );
  });
  it('rejects insecure or credential-bearing callbacks', async () => {
    for (const redirectUri of [
      'http://qc.example/callback',
      'https://user:pass@qc.example/callback',
      'https://qc.example/callback?secret=x',
    ]) {
      await expect(
        createDriveAuthorization({
          clientId: '123.apps.googleusercontent.com',
          redirectUri,
          expectedEmail: 'concost.dt@gmail.com',
        }),
      ).rejects.toMatchObject({ code: 'DRIVE_CALLBACK_INVALID' });
    }
  });
  it('rejects the wrong account without treating the login hint as authorization', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ user: { emailAddress: 'wrong@example.com' } }),
      );
    await expect(
      verifyDriveAccount(fetcher, token, 'concost.dt@gmail.com'),
    ).rejects.toMatchObject({ code: 'DRIVE_ACCOUNT_MISMATCH' });
  });
  it('does not invent a 10GB limit when quota data is absent', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ user: { emailAddress: 'concost.dt@gmail.com' } }),
      );
    await expect(
      verifyDriveAccount(fetcher, token, 'concost.dt@gmail.com'),
    ).resolves.toEqual({ email: 'concost.dt@gmail.com', quota: null });
  });
  it('keeps quota decimal strings exact even above JS safe integer range', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        user: { emailAddress: 'concost.dt@gmail.com' },
        storageQuota: { limit: '9007199254740993', usage: '100' },
      }),
    );
    expect(
      (await verifyDriveAccount(fetcher, token, 'concost.dt@gmail.com')).quota
        ?.limit,
    ).toBe('9007199254740993');
  });
  it('does not leak provider token/error text when refresh fails', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ error: 'invalid_grant', secret: token }, 400),
      );
    const result = requestDriveToken(fetcher, {
      clientId: '123.apps.googleusercontent.com',
      clientSecret: 'synthetic-secret',
      refreshToken: 'synthetic-refresh',
    });
    await expect(result).rejects.toMatchObject({
      code: 'DRIVE_RECONNECT_REQUIRED',
      uncertain: false,
    });
    await expect(result).rejects.not.toHaveProperty(
      'message',
      expect.stringContaining(token),
    );
  });
  it('requires offline refresh token and drive.file consent on first exchange', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        access_token: token,
        token_type: 'Bearer',
        scope: QC_DRIVE_SCOPE,
      }),
    );
    await expect(
      requestDriveToken(fetcher, {
        clientId: '123.apps.googleusercontent.com',
        clientSecret: 'synthetic-secret',
        code: 'synthetic-code',
        verifier: 'a'.repeat(64),
        redirectUri: 'https://qc.example/callback',
      }),
    ).rejects.toMatchObject({ code: 'DRIVE_CONSENT_REQUIRED' });
  });
  it('bounds malformed provider response size', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('x'.repeat(65537)));
    await expect(
      verifyDriveAccount(fetcher, token, 'concost.dt@gmail.com'),
    ).rejects.toMatchObject({ code: 'DRIVE_INVALID_RESPONSE' });
  });
});

describe('QC Google Drive immutable upload transport', () => {
  it('reads resumable-registration metadata using the provider checksum without a legacy app hash', async () => {
    const start = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        headers: {
          Location:
            'https://www.googleapis.com/upload/drive/v3/files?upload_id=synthetic',
        },
      }),
    );
    await driveTransfer(start, token).begin(object);
    const registered = JSON.parse(
      start.mock.calls[0][1]!.body as string,
    ) as typeof metadata;
    expect(registered.appProperties).not.toHaveProperty('sha256');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          ...registered,
          size: String(object.size),
          trashed: false,
          sha256Checksum: sha256,
        }),
      )
      .mockResolvedValueOnce(new Response(bytes));
    await expect(driveFiles(fetcher, token).download(object)).resolves.toEqual(
      bytes,
    );
    expect(fetcher.mock.calls[0][0]).toEqual(
      expect.stringContaining('sha256Checksum'),
    );
  });
  it.each([
    { legacy: sha256, provider: undefined },
    { legacy: undefined, provider: sha256 },
    { legacy: sha256, provider: sha256 },
  ])(
    'accepts matching legacy/provider metadata hashes %j',
    async ({ legacy, provider }) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        response({
          ...metadata,
          appProperties: { ...metadata.appProperties, sha256: legacy },
          sha256Checksum: provider,
        }),
      );
      await expect(
        driveFiles(fetcher, token).verify(object),
      ).resolves.toBeUndefined();
    },
  );
  it.each([
    { legacy: undefined, provider: undefined },
    { legacy: 'b'.repeat(64), provider: sha256 },
    { legacy: sha256, provider: 'b'.repeat(64) },
    { legacy: undefined, provider: 'b'.repeat(64) },
    { legacy: '', provider: sha256 },
    { legacy: sha256, provider: '' },
  ])(
    'rejects absent or conflicting checksum metadata %j',
    async ({ legacy, provider }) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        response({
          ...metadata,
          appProperties: { ...metadata.appProperties, sha256: legacy },
          sha256Checksum: provider,
        }),
      );
      await expect(
        driveFiles(fetcher, token).verify(object),
      ).rejects.toMatchObject({ code: 'DRIVE_OBJECT_MISMATCH' });
    },
  );
  it('still rejects tampered bytes when resumable provider metadata matches', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          ...metadata,
          appProperties: { ...metadata.appProperties, sha256: undefined },
          sha256Checksum: sha256,
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 4])));
    await expect(
      driveFiles(fetcher, token).download(object),
    ).rejects.toMatchObject({ code: 'DRIVE_CONTENT_MISMATCH' });
  });
  it('marks post-upload metadata conflicts as uncertain because bytes may exist', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: {
            Location:
              'https://www.googleapis.com/upload/drive/v3/files?upload_id=test',
          },
        }),
      )
      .mockResolvedValueOnce(
        response({ ...metadata, parents: ['wrongFolder123'] }),
      );
    await expect(
      driveFiles(fetcher, token).upload(object, bytes),
    ).rejects.toMatchObject({ code: 'DRIVE_OBJECT_MISMATCH', uncertain: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('creates a separate QC folder with a previously reserved stable ID', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        id: object.folderId,
        mimeType: 'application/vnd.google-apps.folder',
        trashed: false,
        appProperties: {
          qcApp: 'fin-rc-review-studio',
          qcConnection: connectionId,
        },
      }),
    );
    await expect(
      driveFiles(fetcher, token).createFolder({
        id: object.folderId,
        connectionId,
      }),
    ).resolves.toBe(object.folderId);
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.name).toBe('CONCOST QC - 검수 자료');
    expect(body).not.toHaveProperty('parents');
  });
  it('checks file scope and actual bytes before returning a download', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(metadata))
      .mockResolvedValueOnce(new Response(bytes));
    expect(await driveFiles(fetcher, token).download(object)).toEqual(bytes);
    expect(fetcher.mock.calls[1][0]).toBe(
      `https://www.googleapis.com/drive/v3/files/${object.id}?alt=media`,
    );
  });
  it.each([
    new Uint8Array([1, 2]),
    new Uint8Array([1, 2, 3, 4]),
    new Uint8Array([1, 2, 4]),
  ])(
    'rejects truncated, expanded or changed download bytes %j',
    async (body) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response(metadata))
        .mockResolvedValueOnce(new Response(new Uint8Array(body)));
      await expect(
        driveFiles(fetcher, token).download(object),
      ).rejects.toThrow();
    },
  );
  it('allocates a stable ID separately so the repository can reserve it before upload', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ ids: [object.id] }));
    await expect(driveFiles(fetcher, token).allocateId()).resolves.toBe(
      object.id,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('uploads only the supplied view via resumable upload and checks returned lineage', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: {
            Location:
              'https://www.googleapis.com/upload/drive/v3/files?upload_id=test',
          },
        }),
      )
      .mockResolvedValueOnce(response(metadata));
    const backing = new Uint8Array([99, 1, 2, 3, 88]);
    await driveFiles(fetcher, token).upload(object, backing.subarray(1, 4));
    expect(fetcher).toHaveBeenCalledTimes(2);
    const init = fetcher.mock.calls[1][1]!;
    expect([...new Uint8Array(init.body as Uint8Array)]).toEqual([...bytes]);
    expect(init.method).toBe('PUT');
    expect(init.redirect).toBe('manual');
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).id).toBe(
      object.id,
    );
  });
  it('rejects wrong size or hash before transmitting any bytes', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      driveFiles(fetcher, token).upload(object, new Uint8Array([1, 2, 4])),
    ).rejects.toMatchObject({ code: 'DRIVE_INPUT_MISMATCH' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('never forwards credentials or content to a foreign resumable URL', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        headers: {
          Location: 'https://attacker.example/upload?upload_id=test',
        },
      }),
    );
    await expect(
      driveFiles(fetcher, token).upload(object, bytes),
    ).rejects.toMatchObject({
      code: 'DRIVE_INVALID_RESPONSE',
      uncertain: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { parents: ['anotherFolder123'] },
    {
      appProperties: {
        ...metadata.appProperties,
        qcConnection: 'another-connection',
      },
    },
    { appProperties: { ...metadata.appProperties, sha256: 'b'.repeat(64) } },
    { trashed: true },
  ])('rejects stored file with mismatched metadata %j', async (override) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ ...metadata, ...override }));
    await expect(
      driveFiles(fetcher, token).verify(object),
    ).rejects.toMatchObject({ code: 'DRIVE_OBJECT_MISMATCH' });
  });
  it('reports unknown write outcome without silently retrying or replacing the ID', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: {
            Location:
              'https://www.googleapis.com/upload/drive/v3/files?upload_id=test',
          },
        }),
      )
      .mockRejectedValueOnce(new Error(`secret: ${token}`));
    await expect(
      driveFiles(fetcher, token).upload(object, bytes),
    ).rejects.toMatchObject({ code: 'DRIVE_NETWORK_ERROR', uncertain: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
