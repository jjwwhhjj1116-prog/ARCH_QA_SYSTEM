// Built Worker + SQLite Durable Object; isolated synthetic D1, no network/provider calls.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { smokeLargeReport } from './smoke-large-report.mjs';
import { syntheticDrive } from './smoke-drive-provider.mjs';

const largeReport = process.argv.includes('--large-report');
const drive = largeReport ? syntheticDrive() : null;

const mf = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        name: 'concost-qc-studio',
        modules: [
          'index.js',
          ...(await readdir('dist/server', { recursive: true })).filter(
            (n) => n !== 'index.js' && /\.m?js$/.test(n),
          ),
        ].map((n) => ({ type: 'ESModule', path: resolve('dist/server', n) })),
        modulesRoot: resolve('dist/server'),
        compatibilityDate: '2026-09-01',
        compatibilityFlags: ['nodejs_compat'],
        bindings: {
          EMPLOYEE_LOGIN_ENABLED: 'true',
          LOCAL_DEMO_MODE: 'false',
          FILE_STORAGE_PROVIDER: 'google-drive',
          ...(drive ? { AI_SETTINGS_ENCRYPTION_KEY: drive.secret } : {}),
          APP_ALLOWED_EMAILS: 'compute@example.test',
          APP_ORIGIN: 'http://localhost',
        },
        d1Databases: ['DB'],
        durableObjects: {
          QUANTITY_INSPECTION: {
            className: 'QuantityInspectionObject',
            useSQLite: true,
          },
        },
        outboundService: (request) => {
          if (drive) return drive.fetch(request);
          throw new Error('External network prohibited in compute smoke');
        },
      },
    ],
  }),
);
try {
  const db = await mf.getD1Database('DB');
  // D1 exec accepts a batch of single-line SQL statements. Keep trigger bodies intact.
  for (const name of (await readdir('drizzle'))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    const sql = await readFile(resolve('drizzle', name), 'utf8');
    await db.exec(sql.replace(/--[^\r\n]*/g, '').replace(/\r?\n/g, ' '));
  }
  const projectId = '11111111-1111-4111-8111-111111111111';
  const caseId = '22222222-2222-4222-8222-222222222222';
  await db.exec(
    `INSERT INTO user_profile VALUES ('compute','compute@example.test','Synthetic',1);
    INSERT INTO project VALUES ('${projectId}','COMPUTE','Synthetic',NULL,'active','compute',1);
    INSERT INTO project_member VALUES ('member','${projectId}','compute','reviewer',1);
    INSERT INTO review_case VALUES ('${caseId}','${projectId}','FIN','FIN','draft','compute',NULL,NULL,1);`.replace(
      /\n/g,
      ' ',
    ),
  );
  const token = randomBytes(32).toString('hex');
  await db
    .prepare(
      "INSERT INTO employee_account VALUES ('compute','compute@example.test','synthetic-not-a-password',1,1,?)",
    )
    .bind(Date.now())
    .run();
  await db
    .prepare("INSERT INTO employee_session VALUES (?,'compute',1,?,?)")
    .bind(
      createHash('sha256').update(token).digest('hex'),
      Date.now() + 300000,
      Date.now(),
    )
    .run();
  const namespace = await mf.getDurableObjectNamespace('QUANTITY_INSPECTION');
  const stub = namespace.get(namespace.idFromName(projectId));
  const health = await stub.health();
  assert.equal(await health.ready, true);
  const url = `http://localhost/api/projects/${projectId}/review?caseId=${caseId}`;
  const headers = { cookie: `__Host-qc_session=${token}; qc_session=${token}` };
  const direct = await stub.fetch(url, { headers });
  assert.equal(direct.status, 200, `DO direct: ${await direct.text()}`);
  const response = await mf.dispatchFetch(url, { headers });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual(body.data.sources, []);
  const appOrigin = new URL(url).origin;
  const invalidPost = await mf.dispatchFetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      origin: appOrigin,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      action: 'prepare-source',
      caseId,
      uploadId: 'not-an-id',
    }),
  });
  assert.equal(invalidPost.status, 400);
  assert.equal((await invalidPost.json()).error.code, 'INVALID_REVIEW_INPUT');
  assert.equal((await stub.fetch(url)).status, 401);
  assert.equal(
    (
      await mf.dispatchFetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          origin: 'https://evil.invalid',
          'content-type': 'application/json',
        },
        body: '{}',
      })
    ).status,
    403,
  );
  if (largeReport)
    await smokeLargeReport({ mf, db, projectId, caseId, url, headers, drive });
  await db.exec("DELETE FROM project_member WHERE user_id='compute'");
  assert.equal((await mf.dispatchFetch(url, { headers })).status, 403);
  console.log(
    JSON.stringify({
      builtWorker: true,
      durableObject: true,
      d1: true,
      stateRead: true,
      mutationValidation: true,
      unauthenticatedDenied: true,
      otherProjectDenied: true,
      crossSiteDenied: true,
      realAi: false,
      production: false,
    }),
  );
} finally {
  await mf.dispose();
}
