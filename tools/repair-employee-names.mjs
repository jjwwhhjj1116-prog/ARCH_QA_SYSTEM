// Generates a local, guarded name-only repair; never executes remote commands.
// Snapshot shape: [{id,email,display_name}], from the employee/user_profile join.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const nameReader = `import json,sys,openpyxl
book=openpyxl.load_workbook(sys.argv[1],read_only=True,data_only=True)
rows=[]
for row in book.worksheets[0].iter_rows(min_row=10,max_col=15,values_only=True):
 email=row[14] if len(row)>14 else None
 if not isinstance(email,str) or '@' not in email: continue
 rows.append({'email':email.strip().lower(),'name':str(row[2] or '').strip()})
print(json.dumps(rows,ensure_ascii=True))
book.close()`;

const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
export function buildNameRepair(rows, snapshot) {
  if (
    !Array.isArray(rows) ||
    !rows.length ||
    rows.length > 100 ||
    !Array.isArray(snapshot) ||
    snapshot.length !== rows.length ||
    new Set(rows.map((r) => r.email)).size !== rows.length ||
    new Set(snapshot.map((r) => r.id)).size !== snapshot.length ||
    new Set(snapshot.map((r) => r.email)).size !== snapshot.length
  )
    throw new Error('Name snapshot/roster mismatch. Nothing generated.');
  const changes = [];
  for (const row of rows) {
    const prior = snapshot.find((r) => r.email === row.email);
    if (
      !prior ||
      typeof prior.id !== 'string' ||
      !prior.id ||
      typeof prior.display_name !== 'string' ||
      typeof row.name !== 'string' ||
      !row.name.trim() ||
      row.name.length > 120 ||
      Array.from(row.name).some(
        (c) => c.charCodeAt(0) < 32 || c === '\u007f' || c === '\ufffd',
      ) ||
      typeof row.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+$/.test(row.email)
    )
      throw new Error('Invalid name or identity. Nothing generated.');
    if (row.name !== prior.display_name)
      changes.push({ ...prior, next: row.name });
  }
  if (!changes.length) return { sql: '', count: 0 };
  const matches = changes
    .map(
      (r) =>
        `(id=${quote(r.id)} AND email=${quote(r.email)} AND display_name=${quote(r.display_name)})`,
    )
    .join(' OR ');
  const cases = changes
    .map((r) => `WHEN ${quote(r.id)} THEN ${quote(r.next)}`)
    .join(' ');
  // A single UPDATE is atomic. One stale profile prevents the whole repair.
  const sql = `UPDATE user_profile SET display_name=CASE id ${cases} ELSE display_name END WHERE (${matches}) AND (SELECT COUNT(*) FROM user_profile WHERE ${matches})=${changes.length} RETURNING id;\n`;
  return { sql, count: changes.length };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [xlsx, python, snapshotPath, outputPath] = process.argv.slice(2);
  if (!xlsx || !python || !snapshotPath || !outputPath)
    throw new Error(
      'Usage: node tools/repair-employee-names.mjs <xlsx> <python> <name-only-snapshot.json> <work/private/new-repair.sql>',
    );
  const target = resolve(outputPath);
  const scope = relative(resolve('work/private'), target);
  if (!scope || scope.startsWith('..') || existsSync(target))
    throw new Error('Output must be a new file inside work/private.');
  const result = spawnSync(python, ['-c', nameReader, resolve(xlsx)], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error('Name workbook read failed; private output suppressed.');
  const rows = JSON.parse(result.stdout);
  result.stdout = '';
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const repair = buildNameRepair(rows, snapshot);
  if (repair.count)
    writeFileSync(target, repair.sql, { flag: 'wx', mode: 0o600 });
  console.log(
    JSON.stringify({
      mode: 'generated-only',
      profiles: rows.length,
      namesToRepair: repair.count,
      credentialsChanged: false,
      remoteExecuted: false,
    }),
  );
}
