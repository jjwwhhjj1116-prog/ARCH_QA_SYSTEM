// Private HTTP service binding only: no public routes, storage or key persistence.
export async function forwardGemini(
  request: Request,
  send: typeof fetch = fetch,
) {
  const url = new URL(request.url);
  const modelPath = /^\/v1beta\/models\/gemini-[a-zA-Z0-9._-]{1,96}$/;
  const allowed =
    request.method === 'GET'
      ? url.pathname === '/v1beta/models' || modelPath.test(url.pathname)
      : request.method === 'POST' &&
        modelPath.test(url.pathname.replace(/:generateContent$/, '')) &&
        url.pathname.endsWith(':generateContent');
  if (
    url.origin !== 'https://generativelanguage.googleapis.com' ||
    !allowed ||
    url.username ||
    url.password ||
    [...url.searchParams.keys()].some(
      (key) => !['pageSize', 'pageToken'].includes(key),
    )
  )
    return new Response(null, { status: 400 });
  const key = request.headers.get('x-goog-api-key');
  if (!key || key.length > 512) return new Response(null, { status: 400 });
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (request.method === 'POST') {
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 64 * 1024) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(next.value);
    }
    body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  // No redirects/retries, and never forward browser cookies or authorization.
  const response = await send(url.toString(), {
    method: request.method,
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body,
    redirect: 'manual',
    cache: 'no-store',
    signal: request.signal,
  });
  const headers = new Headers(response.headers);
  headers.set('x-qc-gemini-response', 'upstream');
  return new Response(response.body, { status: response.status, headers });
}

const worker = { fetch: (request: Request) => forwardGemini(request) };
export default worker;
