// Name-only repair on the explicitly configured QC deployment. No credentials read.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildNameRepair, nameReader } from './repair-employee-names.mjs';
const [xlsx, python, mode] = process.argv.slice(2);
const config = JSON.parse(readFileSync('wrangler.cloudflare.json', 'utf8'));
if (
  !xlsx ||
  !python ||
  config.name !== 'concost-qc-studio' ||
  config.d1_databases[0].database_id !== 'c80718b5-558c-4bdd-a4ee-d05c6c5e69b0'
)
  throw Error('QC scope mismatch');
function remote(args) {
  const r = spawnSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'concost-qc-studio-db',
      '--remote',
      '--config',
      'wrangler.cloudflare.json',
      ...args,
      '--json',
    ],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 2e6 },
  );
  if (r.status !== 0)
    throw Error('QC database operation failed; private output suppressed');
  const start = r.stdout.search(/^\[\s*$/m);
  if (start < 0) throw Error('QC response uncertain; do not repeat writes');
  return JSON.parse(r.stdout.slice(start))[0].results;
}
const source = spawnSync(python, ['-c', nameReader, resolve(xlsx)], {
  encoding: 'utf8',
  windowsHide: true,
  maxBuffer: 1e6,
});
if (source.status !== 0) throw Error('Workbook name-only read failed');
const rows = JSON.parse(source.stdout);
source.stdout = '';
const query =
  'SELECT u.id,e.email,u.display_name FROM employee_account e JOIN user_profile u ON u.id=e.id ORDER BY e.email';
const snapshot = remote(['--command', query]);
const repair = buildNameRepair(rows, snapshot);
console.log(
  JSON.stringify({
    profiles: snapshot.length,
    namesToRepair: repair.count,
    passwordsRead: false,
  }),
);
if (mode === '--apply' && repair.count) {
  const file = resolve('work/private/name-repair-v20.sql');
  writeFileSync(file, repair.sql, { flag: 'wx', mode: 0o600 });
  remote(['--file', file]);
  if (buildNameRepair(rows, remote(['--command', query])).count)
    throw Error('Name verification failed');
  console.log(
    JSON.stringify({
      namesRepaired: repair.count,
      verified: true,
      credentialsChanged: false,
    }),
  );
}
