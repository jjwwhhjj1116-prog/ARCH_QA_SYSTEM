// Actual local SQLite DO storage, synthetic bytes only; no outbound network.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const source = await readFile('lib/review/ai-recovery.ts', 'utf8');
const journal = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const entry = `
import { DurableObject } from 'cloudflare:workers';
import { AiRecoveryStore } from './journal.js';
export class TestJournal extends DurableObject {
 async fetch(request) {
  const store = new AiRecoveryStore(this.ctx.storage);
  const record = { actorId:'synthetic',projectId:'project',caseId:'case',requestKey:'request',runId:'run',fingerprint:'synthetic',state:'claimed' };
  const run = { id:'run',actorId:'synthetic',projectId:'project',caseId:'case',limitations:['x'.repeat(300000)] };
  const action = new URL(request.url).pathname;
  if (action === '/save') { await store.claim(record); await store.checkpoint(record,run); }
  if (action === '/complete') await store.complete(await store.get('synthetic','case','request'));
  if (action === '/read') {
   const saved = await store.read(await store.get('synthetic','case','request'));
   return Response.json({length:saved.limitations[0].length, id:saved.id});
  }
  if (action === '/duplicate') { try { await store.claim(record); return Response.json({blocked:false}); } catch(e) { return Response.json({blocked:true,code:e.code}); } }
  return Response.json({pending:await store.pending('synthetic','case'),record:await store.get('synthetic','case','request'),bodyCount:(await this.ctx.storage.list({prefix:'ai-body/'})).size});
 }
}
export default {fetch(request,env){return env.JOURNAL.get(env.JOURNAL.idFromName('synthetic')).fetch(request)}};
`;
const mf = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        name: 'recovery-storage-smoke',
        modulesRoot: '/recovery-smoke',
        modules: [
          {
            type: 'ESModule',
            path: '/recovery-smoke/index.js',
            contents: entry,
          },
          {
            type: 'ESModule',
            path: '/recovery-smoke/journal.js',
            contents: journal.replace(
              '@/lib/http/request-boundary',
              './boundary.js',
            ),
          },
          {
            type: 'ESModule',
            path: '/recovery-smoke/boundary.js',
            contents:
              'export class RequestBoundaryError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}',
          },
        ],
        compatibilityDate: '2026-09-01',
        durableObjects: {
          JOURNAL: { className: 'TestJournal', useSQLite: true },
        },
        outboundService: () => {
          throw new Error('Network prohibited');
        },
      },
    ],
  }),
);
try {
  const call = async (action) => {
    const response = await mf.dispatchFetch('http://localhost/' + action);
    assert.equal(response.status, 200);
    return response.json();
  };
  const saved = await call('save');
  assert.equal(saved.record.state, 'ready');
  assert.equal(saved.bodyCount, 3);
  // New request creates a fresh store wrapper over real durable storage.
  assert.deepEqual(await call('read'), { length: 300000, id: 'run' });
  const completed = await call('complete');
  assert.equal(completed.bodyCount, 0);
  assert.equal(completed.record.state, 'completed');
  assert.deepEqual(completed.pending, []);
  assert.deepEqual(await call('duplicate'), {
    blocked: true,
    code: 'AI_REQUEST_ALREADY_STARTED',
  });
  console.log(
    JSON.stringify({
      sqliteDurableStorage: true,
      chunkRoundTrip: true,
      completedBodyCleanup: true,
      duplicateBlocked: true,
      realAi: false,
      production: false,
    }),
  );
} finally {
  await mf.dispose();
}
