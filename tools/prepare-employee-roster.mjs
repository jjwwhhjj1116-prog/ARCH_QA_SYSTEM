// Explicit local credential import. Plain passwords stay in the subprocess pipe
// and process memory; only salted hashes are written to an ignored private file.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';

const [input, python, output = 'work/private/employee-environment.json'] =
  process.argv.slice(2);
if (!input || !python)
  throw new Error(
    'Usage: node tools/prepare-employee-roster.mjs <xlsx> <python> [work/private/output.json]',
  );
const destination = resolve(output);
if (
  !relative(resolve('work/private'), destination) ||
  relative(resolve('work/private'), destination).startsWith('..') ||
  existsSync(destination)
)
  throw new Error(
    'Choose a new file inside work/private; existing credential files are never overwritten.',
  );
const code = `import json,sys,openpyxl\nbook=openpyxl.load_workbook(sys.argv[1],read_only=True,data_only=True)\nrows=[]\nfor row in book.worksheets[0].iter_rows(min_row=10,values_only=True):\n email=row[14] if len(row)>14 else None\n if not isinstance(email,str) or '@' not in email: continue\n password=row[15]\n if password is None: raise ValueError('Missing password')\n if isinstance(password,float) and password.is_integer(): password=int(password)\n rows.append({'email':email.strip().lower(),'name':str(row[2] or '').strip(),'password':str(password)})\nprint(json.dumps(rows,ensure_ascii=False))\nbook.close()`;
const result = spawnSync(python, ['-c', code, resolve(input)], {
  encoding: 'utf8',
  windowsHide: true,
  maxBuffer: 1024 * 1024,
});
if (result.status !== 0)
  throw new Error(
    'Credential workbook could not be read. No credentials were written.',
  );
const rows = JSON.parse(result.stdout);
result.stdout = '';
if (
  !rows.length ||
  new Set(rows.map((r) => r.email)).size !== rows.length ||
  rows.some((r) => !r.name || !r.password || r.password.length > 256)
)
  throw new Error('Roster validation failed. No credentials were written.');
for (const email of ['yjw@con-cost.com', 'yjpark@con-cost.com'])
  if (!rows.some((r) => r.email === email))
    throw new Error('Both designated administrator accounts must be present.');
const entries = rows.map((row) => {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(row.password, salt, 600000, 32, 'sha256').toString(
    'hex',
  );
  row.password = '';
  return {
    id: randomUUID(),
    email: row.email,
    name: row.name,
    passwordHash: `pbkdf2-sha256$600000$${salt.toString('hex')}$${hash}`,
  };
});
// ASCII escaping allows exact splitting below platform per-secret byte limits.
const encoded = JSON.stringify(entries).replace(
  /[\u007f-\uffff]/g,
  (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
);
const set_values = [];
for (let offset = 0; offset < encoded.length; offset += 3800)
  set_values.push({
    key: `EMPLOYEE_ROSTER_${set_values.length + 1}`,
    value: encoded.slice(offset, offset + 3800),
    is_secret: true,
  });
if (set_values.length > 8)
  throw new Error('Roster exceeds the supported size. Nothing written.');
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, JSON.stringify({ set_values }), {
  flag: 'wx',
  mode: 0o600,
});
console.log(
  JSON.stringify({
    accounts: entries.length,
    secretParts: set_values.length,
    path: destination,
    containsPlainPasswords: false,
    uploaded: false,
  }),
);
