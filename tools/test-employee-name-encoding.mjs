import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { buildNameRepair, nameReader } from './repair-employee-names.mjs';

const python = process.argv[2];
assert.ok(
  python,
  'Pass a local Python executable for the code-page regression.',
);
const names = ['유종욱', '박영진', 'Nguyễn Thị Hằng', "O'Brien"];
const ascii = JSON.stringify(names).replace(
  /[\u007f-\uffff]/g,
  (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
);
const result = spawnSync(
  python,
  [
    '-c',
    `import json,sys\nsys.stdout.reconfigure(encoding='cp949')\nprint(json.dumps(json.loads(sys.argv[1]),ensure_ascii=True))`,
    ascii,
  ],
  { encoding: 'utf8', windowsHide: true },
);
assert.equal(result.status, 0);
assert.deepEqual(JSON.parse(result.stdout), names);
const legacy = spawnSync(
  python,
  [
    '-c',
    `import json,sys\nsys.stdout.reconfigure(encoding='cp949')\nprint(json.dumps(json.loads(sys.argv[1])[:2],ensure_ascii=False))`,
    ascii,
  ],
  { encoding: 'utf8', windowsHide: true },
);
assert.equal(legacy.status, 0);
assert.notDeepEqual(JSON.parse(legacy.stdout), names.slice(0, 2));
const importer = readFileSync(
  new URL('./prepare-employee-roster.mjs', import.meta.url),
  'utf8',
);
assert.ok(importer.includes('ensure_ascii=True'));
assert.ok(!importer.includes('ensure_ascii=False'));
assert.ok(nameReader.includes('max_col=15'));
assert.ok(!nameReader.includes('password'));

const rows = names.map((name, i) => ({
  email: `test${i}@example.invalid`,
  name,
}));
const snapshot = rows.map((r, i) => ({
  id: `id-${i}`,
  email: r.email,
  display_name: `broken-${i}`,
}));
const { sql, count } = buildNameRepair(rows, snapshot);
assert.equal(count, 4);
for (const stale of [false, true]) {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE user_profile(id TEXT PRIMARY KEY,email TEXT,display_name TEXT); CREATE TABLE employee_account(id TEXT,password_hash TEXT,credential_version INTEGER,active INTEGER); CREATE TABLE project_member(user_id TEXT,role TEXT);',
  );
  for (const [i, p] of snapshot.entries()) {
    db.prepare('INSERT INTO user_profile VALUES(?,?,?)').run(
      p.id,
      p.email,
      stale && i === 0 ? 'user-edited-name' : p.display_name,
    );
    db.prepare('INSERT INTO employee_account VALUES(?,?,?,?)').run(
      p.id,
      'synthetic-hash',
      2,
      1,
    );
    db.prepare('INSERT INTO project_member VALUES(?,?)').run(
      p.id,
      i === 0 ? 'workspace_admin' : 'reviewer',
    );
  }
  const authBefore = db.prepare('SELECT * FROM employee_account').all();
  const rolesBefore = db.prepare('SELECT * FROM project_member').all();
  assert.equal(db.prepare(sql).all().length, stale ? 0 : 4);
  assert.deepEqual(
    db.prepare('SELECT * FROM employee_account').all(),
    authBefore,
  );
  assert.deepEqual(
    db.prepare('SELECT * FROM project_member').all(),
    rolesBefore,
  );
  if (!stale)
    assert.deepEqual(
      db
        .prepare('SELECT display_name FROM user_profile ORDER BY id')
        .all()
        .map((r) => r.display_name),
      names,
    );
  else
    assert.equal(
      db.prepare('SELECT display_name FROM user_profile WHERE id=?').get('id-1')
        .display_name,
      'broken-1',
    );
  db.close();
}
assert.equal(
  buildNameRepair(
    rows,
    snapshot.map((r, i) => ({ ...r, display_name: names[i] })),
  ).count,
  0,
);
assert.throws(() =>
  buildNameRepair([{ ...rows[0], name: '\uFFFD' }], [snapshot[0]]),
);
assert.throws(() => buildNameRepair(rows, snapshot.slice(1)));
console.log(
  'PASS: Windows cp949 JSON round trip; name-only atomic repair; auth and roles unchanged; stale snapshot aborts; invalid names rejected.',
);
