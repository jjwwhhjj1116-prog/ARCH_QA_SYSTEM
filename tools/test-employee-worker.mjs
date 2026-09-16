// Own the local Worker and test process together; no production access or roster.
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  prepareFixture,
  runHttpTest,
  cleanupFixture,
} from './test-employee-http.mjs';
prepareFixture();
const child = spawn(
  process.execPath,
  [
    resolve('node_modules/wrangler/bin/wrangler.js'),
    'dev',
    '--config',
    'dist/server/wrangler.json',
    '--port',
    '4184',
    '--inspector-port',
    '9246',
    '--var',
    process.env.QC_DIRECT_TEST === 'true'
      ? 'EMPLOYEE_LOGIN_ENABLED:false'
      : 'EMPLOYEE_LOGIN_ENABLED:true',
    '--var',
    'APP_ORIGIN:http://localhost:4184',
    '--persist-to',
    '.wrangler/state',
    '--log-level',
    'info',
  ],
  {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [`EMPLOYEE_ROSTER_${i + 1}`, '']),
      ),
      WRANGLER_WRITE_LOGS: 'false',
      WRANGLER_LOG_PATH: '.wrangler/logs',
      WRANGLER_REGISTRY_PATH: '.wrangler/auth-http-registry',
    },
  },
);
let diagnostics = '';
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (chunk) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-6000);
  });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`Local Worker exited: ${child.exitCode}`);
    try {
      const response = await fetch('http://localhost:4184', {
        signal: AbortSignal.timeout(1000),
      });
      ready = response.ok && (await response.text()).includes('CONCOST');
      if (ready) break;
    } catch {
      /* Startup only; assertions are never retried. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Local production Worker did not start');
  await runHttpTest();
} catch (error) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.error('Local Worker diagnostics (no real accounts):', diagnostics);
  throw error;
} finally {
  if (child.pid && child.exitCode === null) {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    else child.kill('SIGTERM');
  }
  cleanupFixture();
}
