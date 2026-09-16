// Explicit local credential import. Plain passwords stay in the subprocess pipe
// and process memory; only salted hashes are written to an ignored private file.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import {
  pbkdf2Sync,
  scryptSync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

const [
  input,
  python,
  output = 'work/private/employee-environment.json',
  previousFile,
] = process.argv.slice(2);
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
// ASCII JSON crosses Windows code pages losslessly, including Korean/Vietnamese.
const code = `import json,sys,openpyxl\nbook=openpyxl.load_workbook(sys.argv[1],read_only=True,data_only=True)\nrows=[]\nfor row in book.worksheets[0].iter_rows(min_row=10,values_only=True):\n email=row[14] if len(row)>14 else None\n if not isinstance(email,str) or '@' not in email: continue\n password=row[15]\n if password is None: raise ValueError('Missing password')\n if isinstance(password,float) and password.is_integer(): password=int(password)\n rows.append({'email':email.strip().lower(),'name':str(row[2] or '').strip(),'password':str(password)})\nprint(json.dumps(rows,ensure_ascii=True))\nbook.close()`;
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
const previous = previousFile
  ? JSON.parse(
      JSON.parse(readFileSync(previousFile, 'utf8'))
        .set_values.map((p) => p.value)
        .join(''),
    )
  : [];
if (
  !rows.length ||
  new Set(rows.map((r) => r.email)).size !== rows.length ||
  rows.some(
    (r) =>
      !r.name ||
      r.name.includes('\uFFFD') ||
      !r.password ||
      r.password.length > 256,
  )
)
  throw new Error('Roster validation failed. No credentials were written.');
for (const email of ['yjw@con-cost.com', 'yjpark@con-cost.com'])
  if (!rows.some((r) => r.email === email))
    throw new Error('Both designated administrator accounts must be present.');
const entries = rows.map((row) => {
  const old = previous.find((entry) => entry.email === row.email);
  if (previousFile) {
    if (
      !old ||
      !/^pbkdf2-sha256\$600000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(
        old.passwordHash,
      )
    )
      throw new Error('Credential migration input mismatch.');
    const [, , oldSalt, oldHash] = old.passwordHash.split('$');
    if (
      !timingSafeEqual(
        pbkdf2Sync(
          row.password,
          Buffer.from(oldSalt, 'hex'),
          600000,
          32,
          'sha256',
        ),
        Buffer.from(oldHash, 'hex'),
      )
    )
      throw new Error(
        'Workbook password differs from the original import; no migration produced.',
      );
  }
  const salt = randomBytes(16);
  const hash = scryptSync(row.password, salt, 32, {
    N: 16384,
    r: 8,
    p: 5,
    maxmem: 32 * 1024 * 1024,
  }).toString('hex');
  row.password = '';
  return {
    id: old?.id ?? randomUUID(),
    email: row.email,
    name: row.name,
    passwordHash: `scrypt$16384$8$5$${salt.toString('hex')}$${hash}`,
  };
});
if (previousFile && entries.length !== previous.length)
  throw new Error('Credential roster size changed; no migration produced.');
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
