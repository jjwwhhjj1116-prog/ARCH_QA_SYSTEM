import { describe, expect, it } from 'vitest';
import { readUploadResponse } from './upload-response';

describe('upload platform failures', () => {
  it.each([503, 413, 429])(
    'preserves HTTP %s instead of reporting network loss',
    async (status) => {
      const body = await readUploadResponse(
        new Response('<html>private diagnostic text</html>', {
          status,
          headers: { 'cf-ray': 'abc123-NRT' },
        }),
      );
      expect(body).toMatchObject({
        error: { code: `UPLOAD_HTTP_${status}`, requestId: 'abc123-NRT' },
      });
      expect(JSON.stringify(body)).not.toMatch(
        /NETWORK_ERROR|private diagnostic/,
      );
    },
  );
  it('preserves structured server error and successful response', async () => {
    for (const body of [
      {
        error: {
          code: 'DRIVE_NOT_CONNECTED',
          message: '연결 필요',
          requestId: 'a',
        },
      },
      { data: { status: 'stored' }, requestId: 'b' },
    ]) {
      expect(await readUploadResponse(Response.json(body))).toEqual(body);
    }
  });
  it('rejects empty successful responses instead of counting a saved file', async () => {
    expect(
      await readUploadResponse(new Response('', { status: 200 })),
    ).toMatchObject({ error: { code: 'UPLOAD_INVALID_RESPONSE' } });
  });
});
