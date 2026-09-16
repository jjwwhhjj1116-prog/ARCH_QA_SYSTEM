// User-authorized initial QC deployment only. No plaintext passwords, provider
// tokens or encryption keys are written to disk or printed by this helper.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
const config = 'dist/server/wrangler.json';
const worker = JSON.parse(readFileSync(config, 'utf8'));
if (
  worker.name !== 'concost-qc-studio' ||
  worker.account_id !== '65161355e2b641a4a878f1826259842c' ||
  worker.r2_buckets?.length
)
  throw new Error('Not the authorized QC direct deployment.');
const invoke = (args, input) => {
  const result = spawnSync(
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
      env: {
        ...process.env,
        WRANGLER_WRITE_LOGS: 'false',
        WRANGLER_LOG_PATH: '.wrangler/logs',
      },
    },
  );
  if (result.status !== 0)
    throw new Error(
      `QC secret operation failed (${result.status}); output suppressed to protect credentials.`,
    );
  return result.stdout;
};
const existing = JSON.parse(invoke(['secret', 'list']));
const names = new Set(existing.map((item) => item.name));
const source = JSON.parse(
  readFileSync(
    existsSync('work/private/employee-scrypt-environment.json')
      ? 'work/private/employee-scrypt-environment.json'
      : 'work/private/employee-environment.json',
    'utf8',
  ),
);
const parts = source.set_values;
if (
  !Array.isArray(parts) ||
  !parts.length ||
  parts.length > 8 ||
  parts.some(
    (p, i) =>
      p.key !== `EMPLOYEE_ROSTER_${i + 1}` ||
      p.is_secret !== true ||
      typeof p.value !== 'string',
  )
)
  throw new Error('Invalid private roster structure.');
const roster = JSON.parse(parts.map((p) => p.value).join(''));
if (
  !Array.isArray(roster) ||
  roster.some(
    (entry) =>
      Object.keys(entry).some(
        (key) => !['id', 'email', 'name', 'passwordHash'].includes(key),
      ) ||
      !/^(?:pbkdf2-sha256\$600000|scrypt\$16384\$8\$5)\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(
        entry.passwordHash,
      ),
  )
)
  throw new Error('Only salted password hashes may be provisioned.');
for (const email of ['yjw@con-cost.com', 'yjpark@con-cost.com'])
  if (!roster.some((entry) => entry.email === email))
    throw new Error('Designated administrators are missing.');
const missingParts = parts.filter((part) => !names.has(part.key));
if (missingParts.length && missingParts.length !== parts.length)
  throw new Error(
    'Partial remote roster exists; reconcile explicitly, do not overwrite.',
  );
const values = Object.fromEntries(
  missingParts.map((part) => [part.key, part.value]),
);
if (!names.has('AI_SETTINGS_ENCRYPTION_KEY'))
  values.AI_SETTINGS_ENCRYPTION_KEY = randomBytes(32).toString('hex');
if (Object.keys(values).length)
  invoke(['secret', 'bulk'], JSON.stringify(values));
console.log(
  JSON.stringify({
    worker: worker.name,
    accountCount: roster.length,
    secretNamesAdded: Object.keys(values),
    existingEncryptionKeyPreserved: names.has('AI_SETTINGS_ENCRYPTION_KEY'),
    plaintextPasswords: false,
  }),
);
