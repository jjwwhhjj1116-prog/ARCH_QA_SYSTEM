// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { driveTransfer, type DriveTransferObject } from './drive-transfer';

const object: DriveTransferObject = {
  id: 'syntheticFile123',
  folderId: 'syntheticFolder123',
  connectionId: '11111111-1111-4111-8111-111111111111',
  keyHash: 'a'.repeat(64),
  contentType: 'application/octet-stream',
  size: 262147,
};
const url =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=secret-session';
const meta = {
  id: object.id,
  size: String(object.size),
  mimeType: object.contentType,
  parents: [object.folderId],
  trashed: false,
  sha256Checksum: 'b'.repeat(64),
  appProperties: {
    qcApp: 'fin-rc-review-studio',
    qcConnection: object.connectionId,
    qcKey: object.keyHash,
  },
};
const token = 'synthetic-token';
afterEach(() => vi.useRealTimers());

describe('Drive resumable transfer boundary', () => {
  it('begins fixed object and sends/resumes/finalizes using provider acknowledgement and checksum', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 200, headers: { Location: url } }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 308,
          headers: { Range: 'bytes=0-262143' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 308,
          headers: { Range: 'bytes=0-262143' },
        }),
      )
      .mockResolvedValueOnce(Response.json(meta));
    const api = driveTransfer(fetcher, token);
    expect(await api.begin(object)).toBe(url);
    const requestBody = fetcher.mock.calls[0][1]?.body;
    if (typeof requestBody !== 'string') throw new Error('Expected JSON body');
    expect(JSON.parse(requestBody)).toMatchObject({
      id: object.id,
      parents: [object.folderId],
    });
    expect(await api.send(object, url, 0, new Uint8Array(262144))).toEqual({
      complete: false,
      offset: 262144,
    });
    expect(await api.probe(object, url)).toEqual({
      complete: false,
      offset: 262144,
    });
    expect(await api.send(object, url, 262144, new Uint8Array(3))).toEqual({
      complete: true,
      offset: object.size,
      metadata: { size: object.size, sha256: meta.sha256Checksum },
    });
    expect(
      new Headers(fetcher.mock.calls[3][1]?.headers).get('Content-Range'),
    ).toBe('bytes 262144-262146/262147');
    for (const [, init] of fetcher.mock.calls)
      expect(init?.redirect).toBe('manual');
  });
  it.each([
    'bytes=1-20',
    'bytes=0-262147',
    'bytes=0-262146',
    'bytes=0-9007199254740992',
    'nonsense',
  ])('rejects invalid acknowledgement %s', async (range) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 308, headers: { Range: range } }),
      );
    await expect(
      driveTransfer(fetcher, token).probe(object, url),
    ).rejects.toMatchObject({ code: 'DRIVE_INVALID_RESPONSE' });
  });
  it('uses zero offset when no bytes acknowledged and distinguishes expired sessions', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 308 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const api = driveTransfer(fetcher, token);
    expect(await api.probe(object, url)).toEqual({
      complete: false,
      offset: 0,
    });
    await expect(api.probe(object, url)).rejects.toMatchObject({
      code: 'DRIVE_SESSION_EXPIRED',
    });
  });
  it('rejects foreign session URL before sending and never follows redirects', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 308,
        headers: { Location: 'https://attacker.example' },
      }),
    );
    const api = driveTransfer(fetcher, token);
    await expect(
      api.probe(object, 'https://attacker.example?upload_id=secret'),
    ).rejects.toMatchObject({ code: 'DRIVE_INVALID_RESPONSE' });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(api.probe(object, url)).rejects.toMatchObject({
      code: 'DRIVE_REQUEST_FAILED',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects a foreign begin Location and unsafe body bounds', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        headers: { Location: 'https://attacker.example?upload_id=x' },
      }),
    );
    const api = driveTransfer(fetcher, token);
    await expect(api.begin(object)).rejects.toMatchObject({
      code: 'DRIVE_INVALID_RESPONSE',
      uncertain: true,
    });
    fetcher.mockClear();
    for (const [offset, length] of [
      [-1, 3],
      [0, 3],
      [262146, 2],
      [0, 1048577],
    ])
      await expect(
        api.send(object, url, offset, new Uint8Array(length)),
      ).rejects.toMatchObject({ code: 'DRIVE_CHUNK_INVALID' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { id: 'wrongFile123' },
    { size: '1' },
    { mimeType: 'text/csv' },
    { parents: ['wrongFolder123'] },
    { trashed: true },
    { appProperties: { ...meta.appProperties, qcConnection: 'other' } },
  ])('rejects mismatching metadata %j', async (change) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ...meta, ...change }));
    await expect(
      driveTransfer(fetcher, token).metadata(object),
    ).rejects.toMatchObject({ code: 'DRIVE_OBJECT_MISMATCH' });
  });
  it('keeps absent checksum pending; malformed checksum never becomes trusted', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ ...meta, sha256Checksum: undefined }),
      )
      .mockResolvedValueOnce(
        Response.json({ ...meta, sha256Checksum: 'invalid' }),
      );
    const api = driveTransfer(fetcher, token);
    await expect(api.metadata(object)).rejects.toMatchObject({
      code: 'DRIVE_CHECKSUM_PENDING',
    });
    await expect(api.metadata(object)).rejects.toMatchObject({
      code: 'DRIVE_INVALID_RESPONSE',
    });
  });
  it('bounds response size and hides provider error bodies', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('x'.repeat(65537)))
      .mockResolvedValueOnce(new Response(token, { status: 500 }));
    const api = driveTransfer(fetcher, token);
    await expect(api.metadata(object)).rejects.toMatchObject({
      code: 'DRIVE_INVALID_RESPONSE',
    });
    await expect(
      api.send(object, url, 0, new Uint8Array(262144)),
    ).rejects.toMatchObject({ code: 'DRIVE_REQUEST_FAILED', uncertain: true });
  });
  it('marks aborted writes uncertain without automatic retries', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(new Error(token)),
            ),
          ),
      );
    const result = driveTransfer(fetcher, token).send(
      object,
      url,
      0,
      new Uint8Array(262144),
    );
    const assertion = expect(result).rejects.toMatchObject({
      code: 'DRIVE_NETWORK_ERROR',
      uncertain: true,
      message: expect.not.stringContaining(token),
    });
    await vi.advanceTimersByTimeAsync(20001);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
