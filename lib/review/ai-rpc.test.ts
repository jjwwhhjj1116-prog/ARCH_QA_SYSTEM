// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { boundedBody } from './ai-rpc';
it('preserves Korean UTF-8 split across chunks at the exact byte limit', async () => {
  const bytes = new TextEncoder().encode('검수');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 2));
      controller.enqueue(bytes.slice(2));
      controller.close();
    },
  });
  expect(await boundedBody(new Response(stream), 6)).toBe('검수');
});
it('cancels a response exceeding the byte limit', async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(7));
    },
    cancel,
  });
  await expect(boundedBody(new Response(stream), 6)).rejects.toThrow(
    'AI_RPC_RESPONSE_TOO_LARGE',
  );
  expect(cancel).toHaveBeenCalledOnce();
});
it('accepts a null response body', async () => {
  expect(await boundedBody(new Response(null, { status: 204 }))).toBe('');
});
