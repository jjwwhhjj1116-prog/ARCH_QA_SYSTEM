import { describe, expect, it, vi } from 'vitest';
import { File as NativeFile } from 'node:buffer';
import { createHash } from 'node:crypto';
import { uploadResumable } from './resumable-upload';

const chunk = 1048576;
const file = (size: number) =>
  new NativeFile([new Uint8Array(size)], 'drawing.pdf') as unknown as File;
const reply = (
  offset: number,
  sizeBytes: number,
  status = offset === sizeBytes ? 'uploaded' : 'uploading',
  extra = {},
) =>
  Response.json({
    data: {
      uploadId: 'id',
      offset,
      sizeBytes,
      chunkBytes: chunk,
      status,
      ...extra,
    },
    requestId: 'test',
  });

describe('resumable upload client', () => {
  it('fails closed if the original cannot be read for its digest', async () => {
    const original = file(4);
    vi.spyOn(original, 'arrayBuffer').mockRejectedValue(
      new Error('unreadable'),
    );
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      uploadResumable('id', original, vi.fn(), fetcher),
    ).rejects.toMatchObject({ code: 'UPLOAD_DIGEST_FAILED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('binds every request to the original digest and distinguishes same-size files', async () => {
    const hashes: string[] = [];
    for (const content of ['abcd', 'wxyz']) {
      const original = new NativeFile(
        [content],
        'drawing.pdf',
      ) as unknown as File;
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(reply(0, 4))
        .mockRejectedValueOnce(new TypeError('network'))
        .mockResolvedValueOnce(reply(4, 4));
      await uploadResumable('id', original, vi.fn(), fetcher);
      const expected = createHash('sha256').update(content).digest('hex');
      expect(
        fetcher.mock.calls.map(
          ([, init]) =>
            (init!.headers as Record<string, string>)['Upload-Sha256'],
        ),
      ).toEqual([expected, expected, expected]);
      hashes.push(expected);
    }
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it('rejects over 200 MiB before reading or hashing the file', async () => {
    const original = file(1);
    Object.defineProperty(original, 'size', { value: 200 * 1024 * 1024 + 1 });
    const read = vi.spyOn(original, 'arrayBuffer');
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      uploadResumable('id', original, vi.fn(), fetcher),
    ).rejects.toMatchObject({ code: 'UPLOAD_INVALID_FILE' });
    expect(read).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('resumes a partial provider acknowledgement without rounding the offset', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(1, 4))
      .mockResolvedValueOnce(reply(4, 4));
    await uploadResumable('id', file(4), vi.fn(), fetcher);
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({
      'Upload-Offset': '1',
    });
    expect((fetcher.mock.calls[1][1]!.body as Blob).size).toBe(3);
  });

  it('slices multiple chunks and reports only acknowledgements', async () => {
    const size = chunk * 2 + 7;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(0, size))
      .mockResolvedValueOnce(reply(chunk, size))
      .mockResolvedValueOnce(reply(chunk * 2, size))
      .mockResolvedValueOnce(reply(size, size));
    const progress = vi.fn();
    expect(
      (await uploadResumable('id', file(size), progress, fetcher)).status,
    ).toBe('uploaded');
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'PUT',
      'PUT',
    ]);
    expect(
      fetcher.mock.calls.slice(1).map(([, init]) => (init!.body as Blob).size),
    ).toEqual([chunk, chunk, 7]);
    expect(
      fetcher.mock.calls
        .slice(1)
        .map(
          ([, init]) =>
            (init!.headers as Record<string, string>)['Upload-Offset'],
        ),
    ).toEqual(['0', String(chunk), String(chunk * 2)]);
    expect(progress.mock.calls).toEqual([
      [0, size],
      [chunk, size],
      [chunk * 2, size],
      [size, size],
    ]);
  });

  it.each(['network', '503'])(
    'reconciles an interrupted final PUT (%s) without resending it',
    async (failure) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(0, 4));
      if (failure === 'network')
        fetcher.mockRejectedValueOnce(new TypeError('network'));
      else
        fetcher.mockResolvedValueOnce(
          new Response('platform', { status: 503 }),
        );
      fetcher.mockResolvedValueOnce(reply(4, 4));
      await uploadResumable('id', file(4), vi.fn(), fetcher);
      expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
        'POST',
        'PUT',
        'POST',
      ]);
    },
  );

  it('resumes the acknowledged chunk after an uncertain PUT was not accepted', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(chunk, chunk + 4))
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(reply(chunk, chunk + 4))
      .mockResolvedValueOnce(reply(chunk + 4, chunk + 4));
    await uploadResumable('id', file(chunk + 4), vi.fn(), fetcher);
    expect(
      fetcher.mock.calls
        .filter(([, init]) => init?.method === 'PUT')
        .map(([, init]) => (init!.body as Blob).size),
    ).toEqual([4, 4]);
  });

  it.each([
    { offset: -1 },
    { offset: chunk * 3 },
    { sizeBytes: 5 },
    { uploadId: 'other' },
    { chunkBytes: 2 },
    { status: 'uploaded', offset: 0 },
    { sha256: 'bad' },
  ])('rejects invalid state %j', async (extra) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(0, chunk * 2, 'uploading', extra));
    await expect(
      uploadResumable('id', file(chunk * 2), vi.fn(), fetcher),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a regressing reconciliation offset', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(chunk, chunk * 2))
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(reply(0, chunk * 2));
    await expect(
      uploadResumable('id', file(chunk * 2), vi.fn(), fetcher),
    ).rejects.toMatchObject({ code: 'UPLOAD_INVALID_OFFSET' });
  });

  it('bounds recovery to two POST attempts', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('network'));
    await expect(
      uploadResumable('id', file(4), vi.fn(), fetcher),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('bounds finalization checks without sending empty chunks', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => reply(4, 4, 'uploading'));
    await expect(
      uploadResumable('id', file(4), vi.fn(), fetcher),
    ).rejects.toMatchObject({ code: 'UPLOAD_FINALIZATION_PENDING' });
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'POST',
      'POST',
    ]);
  });

  it('returns an already completed upload without retransmission', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(4, 4));
    await uploadResumable('id', file(4), vi.fn(), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not retry authorization failure or expose raw platform content', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('private platform text', { status: 403 }),
      );
    await expect(
      uploadResumable('id', file(4), vi.fn(), fetcher),
    ).rejects.toMatchObject({ code: 'UPLOAD_HTTP_403' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
