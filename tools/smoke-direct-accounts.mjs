// User-provided workbook, read-only. Passwords and session cookies never leave
// memory except the authenticated HTTPS exchange with the authorized QC host.
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const [input, python] = process.argv.slice(2);
if (!input || !python)
  throw new Error('Credential workbook and bundled Python required.');
const code = `import json,sys,openpyxl\nb=openpyxl.load_workbook(sys.argv[1],read_only=True,data_only=True)\na=[]\nfor r in b.worksheets[0].iter_rows(min_row=10,values_only=True):\n e=r[14] if len(r)>15 else None\n if not isinstance(e,str) or '@' not in e: continue\n p=r[15]\n if isinstance(p,float) and p.is_integer(): p=int(p)\n a.append({'email':e.strip().lower(),'password':str(p)})\nprint(json.dumps(a))\nb.close()`;
const result = spawnSync(python, ['-c', code, input], {
  encoding: 'utf8',
  windowsHide: true,
  maxBuffer: 1024 * 1024,
});
if (result.status !== 0)
  throw new Error('Workbook read failed; output suppressed.');
const entries = JSON.parse(result.stdout);
result.stdout = '';
const admins = new Set(['yjw@con-cost.com', 'yjpark@con-cost.com']);
const selected = [
  entries.find((e) => e.email === 'yjw@con-cost.com'),
  entries.find((e) => !admins.has(e.email)),
];
if (selected.some((e) => !e)) throw new Error('Test accounts unavailable.');
const origin = 'https://concost-qc-studio.jjwwhhjj1116.workers.dev';
for (const entry of selected) {
  let cookie;
  try {
    const login = await fetch(origin + '/api/auth/login', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(entry),
    });
    assert.equal(login.status, 200, 'Employee HTTPS login');
    await login.arrayBuffer();
    const setCookie = login.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    cookie = setCookie.split(';')[0];
    const session = await fetch(origin + '/api/auth/session', {
      headers: { cookie },
    });
    assert.equal(session.status, 200);
    const actor = (await session.json()).data;
    assert.equal(actor.isAdmin, admins.has(entry.email));
    assert.ok(
      !String(actor.displayName).includes('\ufffd'),
      'Readable account name',
    );
    const home = await fetch(origin + '/', { headers: { cookie } });
    const html = await home.text();
    assert.equal(home.status, 200);
    assert.ok(
      html.includes('검수 작업 홈') && html.includes('workflow-navigation'),
      'Deployed home and left workflow',
    );
    const settings = await fetch(origin + '/api/settings/drive', {
      headers: { cookie },
    });
    assert.equal(
      settings.status,
      actor.isAdmin ? 200 : 403,
      'Company settings role boundary',
    );
    await settings.arrayBuffer();
    const personal = await fetch(origin + '/api/settings/ai/personal', {
      headers: { cookie },
    });
    assert.equal(personal.status, 200, 'Personal AI settings');
    const personalState = (await personal.json()).data;
    if (actor.isAdmin) {
      // Synthetic invalid key only: exercise real provider error handling without
      // reading or forwarding a saved personal key, generating text, or saving.
      const probe = await fetch(origin + '/api/settings/ai/personal', {
        method: 'POST',
        headers: { origin, cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          version: personalState.version,
          apiKey: 'AIza-invalid-qc-synthetic-probe',
        }),
      });
      const failure = await probe.json();
      assert.equal(
        failure.error?.code,
        'AI_AUTHENTICATION_FAILED',
        'Live Google invalid-key classification',
      );
    }
    console.log(
      JSON.stringify({
        role: actor.isAdmin ? 'admin' : 'employee',
        login: 200,
        companySettings: settings.status,
        personalSettings: 200,
      }),
    );
  } finally {
    entry.password = '';
    if (cookie) {
      const logout = await fetch(origin + '/api/auth/logout', {
        method: 'POST',
        headers: { origin, cookie, 'content-type': 'application/json' },
        body: '{}',
      });
      assert.equal(logout.status, 200);
      await logout.arrayBuffer();
      const revoked = await fetch(origin + '/api/auth/session', {
        headers: { cookie },
      });
      assert.equal(revoked.status, 401);
      await revoked.arrayBuffer();
      cookie = '';
    }
  }
}
console.log(
  'Production employee/admin access and logout PASS. No source files or projects changed.',
);
