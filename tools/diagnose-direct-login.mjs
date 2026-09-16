// Print only an allowlisted cryptography diagnostic; never tail request headers.
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const child = spawn(
  process.execPath,
  [
    resolve('node_modules/wrangler/bin/wrangler.js'),
    'tail',
    '--config',
    'wrangler.cloudflare.json',
    '--format',
    'json',
    '--search',
    'PASSWORD_KDF_FAILURE',
  ],
  {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_WRITE_LOGS: 'false' },
  },
);
let pending = '';
child.stdout.on('data', (chunk) => {
  pending += chunk.toString();
  for (const marker of ['ITERATION_LIMIT', 'CRYPTO_UNAVAILABLE']) {
    if (pending.includes(marker)) {
      console.log('PASSWORD_KDF_FAILURE', marker);
      pending = '';
    }
  }
  pending = pending.slice(-8000);
});
child.stderr.resume();
try {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const origin = 'https://concost-qc-studio.jjwwhhjj1116.workers.dev';
  const response = await fetch(origin + '/api/auth/login', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'deployment-check@example.invalid',
      password: 'synthetic-invalid-password',
    }),
  });
  console.log('Synthetic invalid login HTTP', response.status);
  await response.arrayBuffer();
  await new Promise((resolve) => setTimeout(resolve, 4000));
} finally {
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  else child.kill();
}
