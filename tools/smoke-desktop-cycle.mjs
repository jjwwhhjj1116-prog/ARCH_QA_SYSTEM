// Authorized roster login. No credential/cookie logging, screenshots of login,
// traces or server project/data mutations. Native dialogs return synthetic paths.
import { spawnSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
import { unzipSync, strFromU8 } from 'fflate';
const [roster, python, executable] = process.argv.slice(2);
const origin = 'https://concost-qc-studio.jjwwhhjj1116.workers.dev';
let phase = 'roster',
  application;
async function main() {
  assert.ok(roster && python);
  const code =
    "import json,sys,openpyxl\nb=openpyxl.load_workbook(sys.argv[1],read_only=True,data_only=True)\na=[]\nfor r in b.worksheets[0].iter_rows(min_row=10,values_only=True):\n e=r[14] if len(r)>15 else None\n if not isinstance(e,str) or '@' not in e: continue\n p=r[15]\n if isinstance(p,float) and p.is_integer(): p=int(p)\n a.append({'email':e.strip().lower(),'password':str(p)})\ns=[next(x for x in a if x['email']=='yjw@con-cost.com'),next(x for x in a if x['email'] not in ['yjw@con-cost.com','yjpark@con-cost.com'])]\nprint(json.dumps(s))\nb.close()";
  const extracted = spawnSync(python, ['-c', code, roster], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1048576,
  });
  assert.equal(extracted.status, 0, 'Roster read failed (details suppressed)');
  const accounts = JSON.parse(extracted.stdout);
  extracted.stdout = '';
  const source = resolve('desktop/fixtures/합성산출서.csv');
  const before = createHash('sha256')
    .update(await readFile(source))
    .digest('hex');
  const output = resolve('output/playwright/desktop-cycle-' + randomUUID());
  await mkdir(output, { recursive: true });
  phase = 'launch';
  application = await _electron.launch(
    executable
      ? { executablePath: resolve(executable), args: [] }
      : { args: ['desktop/out/main.js'] },
  );
  const page = await application.firstWindow();
  await page.waitForSelector('#login');
  assert.ok(await page.locator('#run').isDisabled());
  assert.ok((await page.evaluate(() => window.qc.session())).error);
  let cycleCount = 0;
  for (const [index, account] of accounts.entries()) {
    const role = index === 0 ? 'admin' : 'employee';
    phase = role + ' login';
    const next = application.waitForEvent('window');
    await page.locator('#login').click();
    const login = await next;
    await login.waitForSelector('#employee-email');
    assert.equal(new URL(login.url()).origin, origin);
    await login.locator('#employee-email').fill(account.email);
    await login.locator('#employee-password').fill(account.password);
    account.password = '';
    const response = login.waitForResponse(
      (r) =>
        r.url() === origin + '/api/auth/login' &&
        r.request().method() === 'POST',
    );
    await login.locator('button[type=submit]').click();
    assert.equal((await response).status(), 200);
    phase = role + ' session';
    await page.locator('#refresh').click();
    await page.waitForFunction(
      () => !document.getElementById('projects').disabled,
    );
    const state = await page.evaluate(() => window.qc.session());
    assert.equal(state.data.email, account.email);
    assert.equal(state.data.isAdmin, index === 0);
    const projects = (await page.evaluate(() => window.qc.projects())).data;
    const project = projects.find((p) =>
      ['workspace_admin', 'project_owner', 'reviewer'].includes(p.role),
    );
    if (project) {
      phase = role + ' select';
      await page.locator('#projects').selectOption(project.id);
      await application.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [path],
        });
      }, source);
      await page.locator('#choose').click();
      await page.waitForFunction(
        () => !document.getElementById('run').disabled,
      );
      phase = role + ' review';
      await page.locator('#run').click();
      await page.waitForFunction(
        () => !document.getElementById('exportTop').disabled,
        null,
        { timeout: 30000 },
      );
      await page.locator('#rows button').first().click();
      assert.match(await page.locator('#detail').innerText(), /1\/0|0/);
      // Attempting to export over the input must fail without changing bytes.
      await application.evaluate(({ dialog }, path) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: path,
        });
      }, source);
      await page.locator('#exportTop').click();
      await page.waitForFunction(() =>
        document.getElementById('status').textContent.includes('덮어쓰지'),
      );
      phase = role + ' export';
      const destination = join(output, role + '-analysis.xlsx');
      await application.evaluate(({ dialog }, path) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: path,
        });
      }, destination);
      await page.locator('#exportTop').click();
      await page.waitForFunction(() =>
        document.getElementById('status').textContent.includes('PC에 저장'),
      );
      const archive = unzipSync(await readFile(destination));
      const scope = strFromU8(archive['xl/worksheets/sheet2.xml']);
      assert.ok(
        scope.includes(project.id) &&
          scope.includes(before) &&
          scope.includes('외부 AI 미사용'),
      );
      assert.ok(
        strFromU8(archive['xl/worksheets/sheet1.xml']).includes('BASIC-SYNTAX'),
      );
      await page.screenshot({ path: join(output, role + '-result.png') });
      cycleCount++;
    }
    phase = role + ' logout';
    await page.locator('#logout').click();
    await page.waitForFunction(
      () => document.getElementById('projects').disabled,
    );
    assert.ok((await page.evaluate(() => window.qc.session())).error);
    assert.ok((await page.evaluate(() => window.qc.export())).error);
    assert.ok(!(await page.locator('#detail').innerText()).includes('1/0'));
    console.log(
      JSON.stringify({
        role,
        login: 'PASS',
        logout: 'PASS',
        cycle: project ? 'PASS' : 'NO_REVIEW_PROJECT',
      }),
    );
  }
  assert.equal(
    createHash('sha256')
      .update(await readFile(source))
      .digest('hex'),
    before,
  );
  assert.ok(cycleCount > 0, 'No authorized project for baseline cycle');
  console.log(
    JSON.stringify({
      output,
      cycleCount,
      originalUnchanged: true,
      serverMutations: 'login/logout only',
      nativeDialogs: 'fixture stub',
      aiInvocations: 0,
    }),
  );
}
try {
  await main();
} catch {
  if (application && phase.endsWith(' review')) {
    try {
      const page = await application.firstWindow();
      console.error(
        'Review status:',
        await page.locator('#status').innerText(),
      );
      await page.screenshot({
        path: 'output/playwright/desktop-review-failure.png',
      });
    } catch {}
  }
  console.error(
    'Desktop smoke FAIL at ' + phase + ' (sensitive details suppressed)',
  );
  process.exitCode = 1;
} finally {
  if (application) {
    try {
      const p = await application.firstWindow();
      await p.evaluate(() => window.qc.logout());
    } catch {}
    await application.close();
  }
}
