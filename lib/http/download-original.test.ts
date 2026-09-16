// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { downloadOriginal } from './download-original';
describe('bounded original download', () => {
  const bytes = Buffer.alloc(1048583, 65);
  const hash = createHash('sha256').update(bytes).digest('hex');
  function fetcher(hashValue = hash) {
    return vi.fn(async (_url: unknown, options?: RequestInit) => {
      const match = String(
        ((options?.headers ?? {}) as Record<string, string>).range,
      ).match(/bytes=(\d+)-(\d+)/)!;
      const [start, end] = match.slice(1).map(Number);
      return new Response(bytes.subarray(start, end! + 1), {
        status: 206,
        headers: {
          'content-range': `bytes ${start}-${end}/${bytes.length}`,
          'x-original-sha256': hashValue,
        },
      });
    });
  }
  it('assembles bounded ranges and verifies the original digest', async () => {
    const fetch = fetcher(),
      progress = vi.fn();
    const result = await downloadOriginal('id', bytes.length, progress, fetch);
    expect(Buffer.from(await result.arrayBuffer())).toEqual(bytes);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(bytes.length);
  });
  it('does not release corrupt bytes', async () => {
    await expect(
      downloadOriginal('id', bytes.length, () => {}, fetcher('a'.repeat(64))),
    ).rejects.toThrow('무결성');
  });
  it('binds the verified response hash to an independently stored registration hash', async () => {
    const fetch = fetcher();
    await expect(
      downloadOriginal('id', bytes.length, () => {}, fetch, 'b'.repeat(64)),
    ).rejects.toThrow('확인하지');
    expect(fetch).toHaveBeenCalledTimes(1);
    const success = await downloadOriginal(
      'id',
      bytes.length,
      () => {},
      fetcher(),
      hash,
    );
    expect(success.size).toBe(bytes.length);
  });
  it('rejects an invalid expected hash before fetching', async () => {
    const fetch = fetcher();
    await expect(
      downloadOriginal('id', bytes.length, () => {}, fetch, 'invalid'),
    ).rejects.toThrow('해시');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects whole-body or malformed responses', async () => {
    const fetch = vi.fn(async () => new Response('a'));
    await expect(downloadOriginal('id', 1, () => {}, fetch)).rejects.toThrow(
      '확인하지',
    );
  });
  it('rejects size before fetching', async () => {
    const fetch = fetcher();
    await expect(
      downloadOriginal('id', 201 * 1048576, () => {}, fetch),
    ).rejects.toThrow('크기');
    expect(fetch).not.toHaveBeenCalled();
  });
});
