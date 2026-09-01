import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const stateDir = mkdtempSync(join(tmpdir(), 'fin-rc-d1-'));
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const baseArgs = [
  wrangler,
  'd1',
  'migrations',
  'apply',
  'DB',
  '--local',
  '--config',
  'wrangler.local.jsonc',
  '--persist-to',
  stateDir,
];
const env = {
  ...process.env,
  WRANGLER_WRITE_LOGS: 'false',
  WRANGLER_LOG_PATH: '.wrangler/logs',
};

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`migration command failed: ${result.status}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

try {
  const first = run(baseArgs);
  if (!first.includes('0001_initial.sql')) {
    throw new Error('clean database did not apply 0001_initial.sql');
  }
  const second = run(baseArgs);
  if (!second.includes('No migrations to apply')) {
    throw new Error('second migration run was not idempotent');
  }
  const verify = run([
    wrangler,
    'd1',
    'execute',
    'DB',
    '--local',
    '--config',
    'wrangler.local.jsonc',
    '--persist-to',
    stateDir,
    '--command',
    "SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type='table' AND name IN ('project','project_member','review_case','audit_event');",
  ]);
  if (!verify.includes('"table_count": 4')) {
    throw new Error('expected Phase 1 tables were not created');
  }
  process.stdout.write(
    'clean migration + idempotency + schema verification: PASS\n',
  );
} finally {
  rmSync(stateDir, { recursive: true, force: true });
}
