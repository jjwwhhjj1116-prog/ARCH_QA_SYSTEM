// Actual workerd receiver check. All outbound requests use synthetic local responses.
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const entry = `
class Service {
  constructor(fetcher = fetch) { this.fetcher = fetcher; }
  broken() { return this.fetcher('https://synthetic.invalid/'); }
  fixed() { const fetcher = this.fetcher; return fetcher('https://synthetic.invalid/'); }
}
export default {
  async fetch() {
    const service = new Service();
    const result = {};
    try {
      const response = await service.broken();
      await response.body?.cancel();
      result.broken = { unexpectedlySucceeded: true };
    } catch (error) {
      result.broken = { name: error.name, illegalInvocation: error.message.includes('Illegal invocation') };
    }
    const response = await service.fixed();
    result.fixed = { status: response.status, body: await response.text() };
    const injected = new Service(async () => new Response('injected-synthetic'));
    result.injected = await (await injected.fixed()).text();
    return Response.json(result);
  }
};
`;

let outboundCalls = 0;
const mf = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        name: 'native-fetch-receiver-smoke',
        modulesRoot: '/native-fetch-smoke',
        modules: [
          {
            type: 'ESModule',
            path: '/native-fetch-smoke/index.js',
            contents: entry,
          },
        ],
        compatibilityDate: '2026-09-01',
        outboundService: (request) => {
          assert.equal(request.url, 'https://synthetic.invalid/');
          outboundCalls++;
          return new Response('native-synthetic');
        },
      },
    ],
  }),
);
try {
  const response = await mf.dispatchFetch('http://localhost/');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.broken, {
    name: 'TypeError',
    illegalInvocation: true,
  });
  assert.deepEqual(result.fixed, { status: 200, body: 'native-synthetic' });
  assert.equal(result.injected, 'injected-synthetic');
  assert.equal(outboundCalls, 1);
  console.log(
    JSON.stringify({
      actualWorkerd: true,
      incorrectReceiverRejected: true,
      detachedNativeFetchPassed: true,
      injectedFetcherPassed: true,
      outboundCalls,
      realNetwork: false,
      production: false,
    }),
  );
} finally {
  await mf.dispose();
}
