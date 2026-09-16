import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const boundary = ts
  .transpileModule(
    await readFile(
      new URL('../workers/gemini-outbound.ts', import.meta.url),
      'utf8',
    ),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    },
  )
  .outputText.replace(/export default[^\n]+/, '');
const mf = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        name: 'rpc-test',
        modules: true,
        compatibilityDate: '2026-09-01',
        durableObjects: { DO: 'TestDO' },
        script: `
import { DurableObject } from 'cloudflare:workers';
${boundary}
export class TestDO extends DurableObject {
  async review(request, google) {
    try {
      const response = await google({url:'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent', method:'POST', headers:[['x-goog-api-key','synthetic-key']], body:'{}'});
      return new Response(response.body, {status:response.status});
    } catch (e) { return new Response(e.name + ': ' + e.message, {status:500}); }
  }
}
export default { async fetch(request, env) {
  return env.DO.get(env.DO.idFromName('test')).review(request, async (googleRequest) => {
    const native = new Request(googleRequest.url, {...googleRequest, signal:AbortSignal.timeout(60000)});
    const response = await forwardGemini(native, async (_url, options) => new Response('ok:' + new TextDecoder().decode(options.body)));
    return {status:response.status, headers:[], body:await response.text()};
  });
}};`,
      },
    ],
  }),
);
try {
  const response = await mf.dispatchFetch('https://qc.example/review');
  const body = await response.text();
  console.log(response.status, body);
  if (response.status !== 200 || body !== 'ok:{}') process.exitCode = 1;
} finally {
  await mf.dispose();
}
