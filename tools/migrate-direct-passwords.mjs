// Explicit, all-or-nothing import repair. Never changes passwords, identities,
// roles or memberships. Private old hashes remain available for recovery.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
const config = 'dist/server/wrangler.json';
const worker = JSON.parse(readFileSync(config, 'utf8'));
if (
  worker.name !== 'concost-qc-studio' ||
  worker.account_id !== '65161355e2b641a4a878f1826259842c' ||
  worker.d1_databases?.[0]?.database_id !==
    'c80718b5-558c-4bdd-a4ee-d05c6c5e69b0'
)
  throw new Error('Not the authorized QC deployment.');
const load = (path) => {
  const parts = JSON.parse(readFileSync(path, 'utf8')).set_values;
  return { parts, entries: JSON.parse(parts.map((p) => p.value).join('')) };
};
const old = load('work/private/employee-environment.json');
const next = load('work/private/employee-scrypt-environment.json');
if (old.entries.length !== 33 || next.entries.length !== 33)
  throw new Error('Unexpected roster size.');
for (const entry of next.entries) {
  const prior = old.entries.find(
    (p) =>
      p.id === entry.id && p.email === entry.email && p.name === entry.name,
  );
  if (
    !prior ||
    !/^[a-f0-9-]{36}$/.test(entry.id) ||
    !/^pbkdf2-sha256\$600000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(
      prior.passwordHash,
    ) ||
    !/^scrypt\$16384\$8\$5\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(
      entry.passwordHash,
    )
  )
    throw new Error('Unexpected credential change.');
}
const matches = old.entries
  .map((e) => `(id='${e.id}' AND password_hash='${e.passwordHash}')`)
  .join(' OR ');
const cases = next.entries
  .map((e) => `WHEN '${e.id}' THEN '${e.passwordHash}'`)
  .join(' ');
const sql = `UPDATE employee_account SET password_hash=CASE id ${cases} ELSE password_hash END, credential_version=credential_version+1 WHERE (${matches}) AND (SELECT COUNT(*) FROM employee_account WHERE ${matches})=33 RETURNING id;`;
if (!process.argv.includes('--apply')) {
  for (const stale of [false, true]) {
    const db = new DatabaseSync(':memory:');
    db.exec(
      'CREATE TABLE employee_account(id TEXT PRIMARY KEY,password_hash TEXT,credential_version INTEGER);',
    );
    const insert = db.prepare('INSERT INTO employee_account VALUES(?,?,1)');
    for (const [i, entry] of old.entries.entries())
      insert.run(entry.id, stale && i === 0 ? 'changed' : entry.passwordHash);
    const updated = db.prepare(sql).all();
    if (updated.length !== (stale ? 0 : 33))
      throw new Error('Atomic migration regression.');
    db.close();
  }
  console.log(
    JSON.stringify({
      mode: 'dry-run',
      accounts: 33,
      identitiesPreserved: true,
      atomicCompareAndSwap: true,
      plaintext: false,
    }),
  );
  process.exit(0);
}
const invoke = (args, input) => {
  const r = spawnSync(
    process.execPath,
    [
      resolve('node_modules/wrangler/bin/wrangler.js'),
      ...args,
      '--config',
      config,
    ],
    {
      input,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, WRANGLER_WRITE_LOGS: 'false' },
    },
  );
  if (r.status !== 0)
    throw new Error(
      'QC migration operation failed; credential output suppressed.',
    );
  return r.stdout;
};
// Update bootstrapping secrets first. Existing rows are deliberately not
// overwritten by provisionConfiguredRoster; only the guarded UPDATE below acts.
invoke(
  ['secret', 'bulk'],
  JSON.stringify(Object.fromEntries(next.parts.map((p) => [p.key, p.value]))),
);
const migrationPath = resolve('work/private/employee-scrypt-repair.sql');
writeFileSync(migrationPath, sql, { flag: 'wx', mode: 0o600 });
const output = invoke([
  'd1',
  'execute',
  'DB',
  '--remote',
  '--file',
  migrationPath,
  '--json',
]);
// Wrangler may print upload progress before its JSON result for --file.
const jsonStart = output.search(/^\[\s*$/m);
if (jsonStart < 0)
  throw new Error(
    'Migration output unavailable; inspect remote counts before any retry.',
  );
const result = JSON.parse(output.slice(jsonStart));
const count = result.flatMap((r) => r.results ?? []).length;
if (count !== 33)
  throw new Error(
    `Credential CAS changed ${count} rows, expected 33. Do not overwrite changed accounts; reconcile first.`,
  );
console.log(
  JSON.stringify({
    accountsMigrated: count,
    passwordsChanged: false,
    identitiesPreserved: true,
    priorSessionsRevoked: true,
  }),
);
