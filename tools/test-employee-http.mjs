// Local production-Worker smoke test. Never accepts a remote target or real roster.
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const origin = 'http://localhost:4184';
const id = randomUUID();
const email = `synthetic-${id}@example.test`;
const password = randomBytes(24).toString('hex');
const salt = randomBytes(16).toString('hex');
const hash = `scrypt$16384$8$5$${salt}$${scryptSync(password, Buffer.from(salt, 'hex'), 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }).toString('hex')}`;
function sql(statement) {
  const result = spawnSync(
    process.execPath,
    [
      resolve('node_modules/wrangler/bin/wrangler.js'),
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      process.env.QC_DIRECT_TEST === 'true'
        ? 'wrangler.cloudflare.json'
        : 'wrangler.local.jsonc',
      '--command',
      statement,
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        WRANGLER_WRITE_LOGS: 'false',
        WRANGLER_LOG_PATH: '.wrangler/logs',
      },
    },
  );
  if (result.status !== 0)
    throw new Error(
      'Local synthetic account fixture failed; SQL and credential output suppressed.',
    );
}
const send = async (path, data, cookie, from = origin) => {
  const response = await fetch(origin + path, {
    method: data ? 'POST' : 'GET',
    headers: {
      origin: from,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  // Drain each body just as the application client does, including errors.
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: response.headers,
  });
};
export function prepareFixture() {
  sql(
    `INSERT INTO user_profile(id,email,display_name,created_at) VALUES('${id}','${email}','Synthetic HTTP test',0); INSERT INTO employee_account(id,email,password_hash,active,credential_version,created_at) VALUES('${id}','${email}','${hash}',1,1,0);`,
  );
}
export async function runHttpTest() {
  const forged = await fetch(`${origin}/api/projects`, {
    headers: {
      'oai-authenticated-user-id': 'forged',
      'oai-authenticated-user-email': 'yjw@con-cost.com',
    },
  });
  assert.equal(forged.status, 401);
  await forged.arrayBuffer();
  assert.equal((await send('/api/projects')).status, 401);
  assert.equal(
    (
      await send(
        '/api/auth/login',
        { email, password },
        undefined,
        'https://other.example.test',
      )
    ).status,
    403,
  );
  const response = await send('/api/auth/login', { email, password });
  if (response.status !== 200)
    throw new Error(
      `Synthetic login ${response.status}: ${(await response.text()).slice(0, 2000)}`,
    );
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /__Host-qc_session=/);
  const cookie = setCookie.split(';')[0];
  const session = await send('/api/auth/session', undefined, cookie);
  if (session.status !== 200)
    throw new Error(
      `Synthetic local session response ${session.status}: ${(await session.text()).slice(0, 500)}`,
    );
  assert.equal(session.status, 200);
  assert.equal((await session.json()).data.isAdmin, false);
  const projects = await send('/api/projects', undefined, cookie);
  assert.equal(projects.status, 200);
  assert.deepEqual((await projects.json()).data, []);
  assert.equal((await send('/api/auth/logout', {}, cookie)).status, 200);
  const revoked = await send('/api/auth/session', undefined, cookie);
  if (revoked.status !== 401)
    throw new Error(
      `Synthetic revoked session response ${revoked.status}: ${(await revoked.text()).slice(0, 500)}`,
    );
  console.log(
    'Local production Worker: login, Secure/HttpOnly cookie, origin rejection, project isolation, logout revocation PASS. Synthetic account only.',
  );
}
export function cleanupFixture() {
  sql(
    `UPDATE employee_account SET active=0,credential_version=credential_version+1 WHERE id='${id}';`,
  );
}
