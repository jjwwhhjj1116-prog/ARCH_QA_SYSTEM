// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { regionalGeminiFetch } from './regional-fetch';

afterEach(() => vi.unstubAllGlobals());

it('calls Google directly without a service binding, preserving body and diagnostics', async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('busy', { status: 503 }));
  vi.stubGlobal('fetch', send);
  const controller = new AbortController();
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent';
  const body = JSON.stringify({
    contents: [{ parts: [{ text: 'synthetic' }] }],
  });
  const response = await regionalGeminiFetch(url, {
    method: 'POST',
    body,
    signal: controller.signal,
    headers: { 'x-goog-api-key': 'SYNTHETIC', cookie: 'DO-NOT-FORWARD' },
  });
  expect(send).toHaveBeenCalledTimes(1);
  const [target, options] = send.mock.calls[0];
  expect(target).toBe(url);
  expect(new TextDecoder().decode(options?.body as Uint8Array)).toBe(body);
  expect(options?.headers).toEqual({
    'x-goog-api-key': 'SYNTHETIC',
    'content-type': 'application/json',
  });
  expect(options?.redirect).toBe('manual');
  controller.abort();
  expect(options?.signal?.aborted).toBe(true);
  expect(response.status).toBe(503);
  expect(response.headers.get('x-qc-gemini-response')).toBe('upstream');
});

it('rejects other destinations before native fetch', async () => {
  const send = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', send);
  const response = await regionalGeminiFetch(
    'https://example.com/v1beta/models',
    {
      headers: { 'x-goog-api-key': 'SYNTHETIC' },
    },
  );
  expect(response.status).toBe(400);
  expect(send).not.toHaveBeenCalled();
});
