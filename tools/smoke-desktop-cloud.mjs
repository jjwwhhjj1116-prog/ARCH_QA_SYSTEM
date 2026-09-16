// Synthetic-only: actual Electron IPC/worker/export; every server request mocked.
import { _electron } from 'playwright';
import { resolve, join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';

const output = resolve('output/playwright/desktop-cloud-' + randomUUID());
await mkdir(output, { recursive: true });
const bytes = await readFile('desktop/fixtures/manual-layout.csv');
const sha = createHash('sha256').update(bytes).digest('hex');
const p = '11111111-1111-4111-8111-111111111111';
const c = '22222222-2222-4222-8222-222222222222';
const s = '44444444-4444-4444-8444-444444444444';
const application = await _electron.launch({ args: ['desktop/out/main.js'] });
try {
  await application.evaluate(
    ({ session }, payload) => {
      const { bytes, sha, p, c, s } = payload;
      const projects = [];
      session.fromPartition('qc-member-session').fetch = async (
        url,
        init = {},
      ) => {
        if (
          init.method &&
          init.method !== 'GET' &&
          !url.endsWith('/api/auth/logout') &&
          !url.endsWith('/api/projects')
        )
          throw new Error('Server mutations are forbidden in this smoke');
        let data;
        if (url.endsWith('/api/auth/session'))
          data = {
            email: 'synthetic@example.invalid',
            displayName: '합성 검증 회원',
            isAdmin: false,
          };
        else if (url.endsWith('/api/projects')) {
          if (init.method === 'POST') {
            const input = JSON.parse(init.body);
            if (input.name !== '합성 등록 원본 검증' || projects.length)
              throw new Error('Unexpected project mutation');
            const project = {
              id: p,
              name: input.name,
              role: 'project_owner',
              status: 'active',
            };
            projects.push(project);
            data = project;
          } else data = projects;
        } else if (url.endsWith('/cases'))
          data = [
            {
              id: c,
              name: '합성 마감 자료',
              discipline: 'FIN',
              status: 'active',
            },
          ];
        else if (url.endsWith('/source-packages'))
          data = [
            {
              id: '33333333-3333-4333-8333-333333333333',
              projectId: p,
              reviewCaseId: c,
              version: 1,
              status: 'inspection_pending',
              displayName: '모의 Drive 등록',
              files: [
                {
                  uploadId: '55555555-5555-4555-8555-555555555555',
                  sourceFileId: '66666666-6666-4666-8666-666666666666',
                  sourceVersionId: s,
                  filename: 'registered-manual.csv',
                  format: 'csv',
                  sizeBytes: bytes.length,
                  status: 'uploaded',
                  uploadState: 'uploaded',
                },
              ],
            },
          ];
        else if (url.endsWith('/original')) {
          const range = /^bytes=(\d+)-(\d+)$/.exec(init.headers.range);
          if (!range) throw new Error('Range missing');
          const start = Number(range[1]),
            end = Number(range[2]);
          return new Response(new Uint8Array(bytes.slice(start, end + 1)), {
            status: 206,
            headers: {
              'content-range': `bytes ${start}-${end}/${bytes.length}`,
              'x-original-sha256': sha,
            },
          });
        } else if (url.endsWith('/api/auth/logout')) data = {};
        else throw new Error('Unexpected request blocked');
        return { ok: true, status: 200, json: async () => ({ data }) };
      };
    },
    { bytes: Array.from(bytes), sha, p, c, s },
  );
  const page = await application.firstWindow();
  await application
    .context()
    .route('https://concost-qc-studio.jjwwhhjj1116.workers.dev/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>Synthetic login only</h1>',
      }),
    );
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.locator('#login').click();
  await page.locator('#profile').waitFor();
  await page.locator('#newProject').click();
  await page.locator('#projectName').fill('합성 등록 원본 검증');
  await page.screenshot({ path: join(output, 'project-form.png') });
  await page.locator('#projectSave').click();
  await page
    .locator(`#projects option[value="${p}"]`)
    .waitFor({ state: 'attached' });
  assert.equal(await page.locator('#projects').inputValue(), p);
  assert.equal(
    await page.locator('#memberEmail').innerText(),
    'synthetic@example.invalid',
  );
  assert.ok(await page.locator('#refresh').isHidden());
  assert.equal(
    await application.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
    1,
    'Login window must close automatically after confirmed session',
  );
  await page.locator('#projects').selectOption(p);
  await page.locator('#cloudChoose').click();
  await page
    .locator('#cloudFile option[value="1"]')
    .waitFor({ state: 'attached' });
  await page.locator('#cloudFile').selectOption('1');
  for (const [width, height] of [
    [1440, 940],
    [1000, 800],
  ]) {
    await application.evaluate(
      ({ BrowserWindow }, size) =>
        BrowserWindow.getAllWindows()[0].setSize(...size),
      [width, height],
    );
    await page.screenshot({ path: join(output, `picker-${width}.png`) });
  }
  await page.locator('#cloudImport').click();
  await page.waitForFunction(() =>
    document
      .getElementById('status')
      .textContent.includes('등록 원본을 가져왔습니다'),
  );
  await page.locator('#inspectMapping').click();
  await page.locator('#mapping-item').waitFor();
  await page.locator('#mappingHeader').fill('1');
  await page.locator('#mappingKind').selectOption('detail');
  for (const [field, column] of [
    ['item', '0'],
    ['formula', '1'],
    ['quantity', '2'],
    ['unit', '3'],
  ])
    await page.locator('#mapping-' + field).selectOption(column);
  assert.ok(await page.locator('#run').isDisabled());
  await page.locator('#mappingConfirm').click();
  await page.locator('#run').click();
  await page.locator('#rows button').first().click();
  assert.match(
    await page.locator('#detail').innerText(),
    /registered-manual.csv/,
  );
  assert.match(await page.locator('#detail').innerText(), /B2/);
  const destination = join(output, 'registered-analysis.xlsx');
  await application.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, destination);
  await page.locator('#exportTop').click();
  await page.waitForFunction(() =>
    document.getElementById('status').textContent.includes('PC에 저장'),
  );
  const zip = unzipSync(await readFile(destination));
  const xml = Object.values(zip).map(strFromU8).join('\n');
  assert.match(xml, /BASIC-SYNTAX/);
  assert.ok(xml.includes(sha), 'Original SHA missing from report');
  assert.ok(xml.includes(s), 'Source version missing from report');
  await page.screenshot({ path: join(output, 'report.png') });
  await page.locator('#logout').click();
  await page.waitForFunction(() => !document.getElementById('login').disabled && document.getElementById('status').textContent.includes('로그아웃했습니다'));
  await page.screenshot({ path: join(output, 'logged-out.png') });
  assert.ok(await page.locator('#exportTop').isDisabled());
  assert.ok(await page.locator('#cloudPanel').isHidden());
  assert.deepEqual(errors, []);
  const result = {
    output,
    pass: true,
    mockedServer: true,
    paidAi: false,
    productionWrites: false,
    sourceVersionId: s,
    sha256: sha,
    pageErrors: errors,
  };
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await application.close();
}
