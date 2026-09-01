import { describe, expect, it } from 'vitest';
import { readBoundedBytes } from './bounded-bytes';

describe('readBoundedBytes', () => {
  it('returns one bounded byte snapshot', async () => {
    const request = binaryRequest(new Uint8Array([1, 2, 3]));
    await expect(readBoundedBytes(request, 3)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it('rejects wrong media type, empty bodies and declared/actual overflow', async () => {
    await expect(
      readBoundedBytes(
        new Request('http://localhost', {
          method: 'PUT',
          headers: { 'content-type': 'text/plain' },
          body: 'abc',
        }),
        3,
      ),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readBoundedBytes(binaryRequest(new Uint8Array()), 3),
    ).rejects.toMatchObject({ code: 'FILE_EMPTY' });
    await expect(
      readBoundedBytes(binaryRequest(new Uint8Array([1, 2, 3, 4])), 3),
    ).rejects.toMatchObject({ status: 413 });
  });
});

function binaryRequest(bytes: Uint8Array<ArrayBuffer>): Request {
  return new Request('http://localhost', {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream' },
    body: bytes,
  });
}
