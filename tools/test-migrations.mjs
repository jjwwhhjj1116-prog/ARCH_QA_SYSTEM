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

function runResult(args) {
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    windowsHide: true,
  });
}

function run(args) {
  const result = runResult(args);
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`migration command failed: ${result.status}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function expectFailure(args, reason) {
  const result = runResult(args);
  if (result.status === 0) throw new Error(reason);
}

try {
  const first = run(baseArgs);
  if (!first.includes('0001_initial.sql')) {
    throw new Error('clean database did not apply 0001_initial.sql');
  }
  if (!first.includes('0002_ingestion.sql')) {
    throw new Error('clean database did not apply 0002_ingestion.sql');
  }
  if (!first.includes('0003_ingestion_case_idempotency.sql')) {
    throw new Error(
      'clean database did not apply 0003_ingestion_case_idempotency.sql',
    );
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
    "SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type='table' AND name IN ('user_profile','project','project_member','review_case','audit_event','source_package','source_file','source_file_version','upload_attempt','import_job');",
  ]);
  if (!verify.includes('"table_count": 10')) {
    throw new Error('expected Phase 1 and ingestion tables were not created');
  }

  const executeBase = [
    wrangler,
    'd1',
    'execute',
    'DB',
    '--local',
    '--config',
    'wrangler.local.jsonc',
    '--persist-to',
    stateDir,
  ];
  run([
    ...executeBase,
    '--command',
    "INSERT INTO user_profile VALUES ('u1','u1@example.test','U1',1),('u2','u2@example.test','U2',1); INSERT INTO project VALUES ('p1','P1','P1',NULL,'active','u1',1),('p2','P2','P2',NULL,'active','u2',1); INSERT INTO review_case VALUES ('c1','p1','C1','FIN','draft','u1',NULL,NULL,1),('c2','p2','C2','FIN','draft','u2',NULL,NULL,1);",
  ]);
  expectFailure(
    [
      ...executeBase,
      '--command',
      "INSERT INTO source_package VALUES ('pkg-bad','p1','c2','mixed','draft','pending','HR-1','idem-bad','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,'u1',1);",
    ],
    'cross-project case/package relation was accepted',
  );

  run([
    ...executeBase,
    '--command',
    "INSERT INTO source_package VALUES ('pkg1','p1','c1','pkg','draft','pending','HR-1','idem-1','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,'u1',1); INSERT INTO source_file VALUES ('f1','pkg1','p1','c1','quantity_source','takeoff','산출서.xlsx','active','u1',1);",
  ]);
  expectFailure(
    [
      ...executeBase,
      '--command',
      "INSERT INTO source_file_version (id,source_file_id,package_id,project_id,review_case_id,version_number,original_filename,extension_claimed,content_type_claimed,size_bytes,r2_object_key,status,project_identity_status,created_by,created_at) VALUES ('v1','f1','pkg1','p1','c1',1,'산출서.xlsx','xlsx','application/octet-stream',10,'opaque','stored','pending','u1',1);",
    ],
    'stored source version without validation evidence was accepted',
  );
  process.stdout.write(
    'clean migration + idempotency + ingestion scope/invariant verification: PASS\n',
  );
} finally {
  rmSync(stateDir, { recursive: true, force: true });
}
