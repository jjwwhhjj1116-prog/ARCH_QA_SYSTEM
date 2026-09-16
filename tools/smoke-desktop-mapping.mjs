// Synthetic-only Electron integration. All authentication/server requests are mocked.
import { _electron } from 'playwright';
import { resolve, join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
const output = resolve('output/playwright/desktop-mapping-' + randomUUID());
await mkdir(output, { recursive: true });
const source = resolve('desktop/fixtures/manual-layout.csv');
const sha = createHash('sha256')
  .update(await readFile(source))
  .digest('hex');
const executable = process.argv[2];
const application = await _electron.launch(
  executable
    ? { executablePath: resolve(executable), args: [] }
    : { args: ['desktop/out/main.js'] },
);
try {
  await application.evaluate(({ session, dialog }, source) => {
    const p = '11111111-1111-4111-8111-111111111111',
      c = '22222222-2222-4222-8222-222222222222';
    const profiles = [];
    const runs = [];
    const sourceId = '44444444-4444-4444-8444-444444444444';
    const mapping = {
      sourceVersionId: sourceId,
      sheet: 'Sheet1',
      headerRow: 1,
      kind: 'detail',
      columns: Object.fromEntries(
        [
          'item',
          'spec',
          'unit',
          'formula',
          'quantity',
          'trade',
          'part',
          'code',
          'scope',
          'dimension',
          'cohort',
        ].map((f) => [f, f === 'item' ? 0 : f === 'formula' ? 1 : null]),
      ),
      confirmed: true,
      arithmeticBasis: 'formula-result',
      dimensionRole: 'unknown',
      dimensionUnit: '',
      cohortConfirmed: false,
    };
    session.fromPartition('qc-member-session').fetch = async (url, request) => {
      let data;
      if (url.endsWith('/api/auth/session'))
        data = {
          email: 'synthetic@example.invalid',
          displayName: '합성 관리자 · 모의 인증',
          isAdmin: true,
        };
      else if (url.endsWith('/api/projects'))
        data = [
          {
            id: p,
            name: '합성 수동매핑 검증',
            role: 'workspace_admin',
            status: 'active',
          },
        ];
      else if (url.endsWith('/cases'))
        data = [
          {
            id: c,
            name: '합성 마감 자료',
            discipline: 'FIN',
            status: 'active',
          },
        ];
      else if (url.includes('/review?')) {
        const runId = new URL(url).searchParams.get('runId');
        data = runId
          ? { run: runs.find((r) => r.id === runId), decisions: [] }
          : {
              profiles,
              canManageGuidelines: true,
              sources: [{ sourceVersionId: sourceId }],
              mappings: [mapping],
              runs: runs.map((r) => ({
                id: r.id,
                createdAt: r.createdAt,
                profileVersion: r.profileVersion,
                trial: true,
                findingCount: 0,
                rowCount: 1,
              })),
            };
      } else if (url.endsWith('/review') && request.method === 'POST') {
        const payload = JSON.parse(request.body);
        if (payload.action === 'run') {
          if (payload.includeAi !== false || payload.trial !== true)
            throw new Error('Paid AI is not allowed');
          const profile = profiles.find((p) => p.id === payload.profileId);
          const run = {
            id: '55555555-5555-4555-8555-555555555555',
            projectId: p,
            caseId: c,
            profileId: profile.id,
            profileVersion: profile.version,
            profile: structuredClone(profile.profile),
            trial: true,
            createdAt: '2026-09-10T00:00:00Z',
            rows: [{}],
            findings: [],
            coverage: [
              {
                ruleId: 'ARITHMETIC',
                label: '산식 검토 · 합성 응답',
                evaluated: 1,
                unevaluated: 0,
                reasons: [],
              },
            ],
            limitations: [
              '모의 서버 시험입니다. 실제 회사 자료를 검수하지 않았습니다.',
            ],
          };
          runs.push(run);
          profile.trialRunId = run.id;
          data = { run, decisions: [] };
        } else if (payload.action === 'approve') {
          const profile = profiles.find((p) => p.id === payload.profileId);
          if (
            payload.trialRunId !== profile.trialRunId ||
            profile.profile.instructions.some((i) => i.enabled)
          )
            throw new Error('Untested profile');
          profile.status = 'active';
          data = { id: profile.id };
        } else if (payload.action === 'profile') {
          profiles.push({
            id: '33333333-3333-4333-8333-333333333333',
            version: 1,
            status: 'draft',
            profile: payload.profile,
            createdAt: '2026-09-09T00:00:00Z',
            trialRunId: null,
          });
          data = { id: profiles[0].id };
        } else throw new Error('Unexpected mutation blocked');
      } else if (url.endsWith('/api/auth/logout')) data = {};
      else throw new Error('Unexpected request blocked');
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: structuredClone(data) }),
      };
    };
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [source],
    });
  }, source);
  const page = await application.firstWindow();
  await page.waitForSelector('#refresh');
  await page.locator('#refresh').click();
  await page
    .locator('#projects')
    .selectOption('11111111-1111-4111-8111-111111111111');
  await page.locator('#choose').click();
  await page.locator('#inspectMapping').click();
  await page.locator('#mapping-item').waitFor();
  await page.locator('#mappingHeader').fill('1');
  await page.locator('#mappingKind').selectOption('detail');
  await page.locator('#mapping-item').selectOption('0');
  await page.locator('#mapping-formula').selectOption('1');
  await page.locator('#mapping-quantity').selectOption('2');
  await page.locator('#mapping-unit').selectOption('3');
  assert.ok(await page.locator('#run').isDisabled());
  await page.locator('#mappingConfirm').click();
  assert.ok(await page.locator('#run').isEnabled());
  await page.evaluate(() => {
    document.getElementById('mappingPanel').scrollTop = 0;
    document.querySelector('.mappingForm').scrollTop = 0;
  });
  await page.screenshot({ path: join(output, 'mapping-1440.png') });
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1000, 800),
  );
  await page.screenshot({ path: join(output, 'mapping-1000.png') });
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 940),
  );
  await page.locator('#run').click();
  await page.locator('#rows button').first().click();
  assert.match(await page.locator('#detail').innerText(), /manual-layout.csv/);
  assert.match(await page.locator('#detail').innerText(), /B2/);
  const destination = join(output, 'manual-analysis.xlsx');
  await application.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, destination);
  await page.locator('#exportTop').click();
  await page.waitForFunction(() =>
    document.getElementById('status').textContent.includes('PC에 저장'),
  );
  const zip = unzipSync(await readFile(destination));
  assert.match(strFromU8(zip['xl/worksheets/sheet1.xml']), /BASIC-SYNTAX/);
  assert.ok(strFromU8(zip['xl/worksheets/sheet2.xml']).includes(sha));
  await page.locator('#instructionsToggle').click();
  await page.locator('#instructionName').fill('합성 일반 지침');
  await page.locator('#instructionReason').fill('모의 검증 · 운영 저장 아님');
  await page.locator('#instructionAdd').click();
  await page
    .locator('#instructionRows textarea')
    .fill('단위와 부위가 확인되지 않은 비교는 미평가로 표시한다.');
  await page.locator('#instructionRows input[type=checkbox]').uncheck();
  await page.locator('#instructionSave').click();
  await page.waitForFunction(() =>
    document
      .getElementById('instructionsPanel')
      .textContent.includes('새 초안 버전을 저장했습니다'),
  );
  await page.locator('#instructionReload').click();
  await page
    .locator('#instructionProfile')
    .selectOption('33333333-3333-4333-8333-333333333333');
  assert.equal(
    await page.locator('#instructionRows textarea').inputValue(),
    '단위와 부위가 확인되지 않은 비교는 미평가로 표시한다.',
  );
  assert.ok(await page.locator('#instructionTrial').isEnabled());
  await page.locator('#instructionTrial').click();
  await page.waitForFunction(
    () => !document.getElementById('instructionApprove').disabled,
  );
  assert.match(
    await page.locator('#instructionTrialResult').innerText(),
    /산식/,
  );
  // Use the actual keyboard action; activation confirmation remains explicit.
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#instructionApprove').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() =>
    document
      .querySelector('#instructionProfile option:checked')
      ?.textContent.includes('active'),
  );
  await page.evaluate(() => {
    document.getElementById('instructionsPanel').scrollTop = 0;
  });
  await page.screenshot({ path: join(output, 'instructions-1440.png') });
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1000, 800),
  );
  await page.screenshot({ path: join(output, 'instructions-1000.png') });
  await page.locator('#instructionTrialResult details summary').click();
  await page.locator('#instructionTrialResult').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, 'instructions-result-1000.png') });
  await page.locator('#logout').click();
  assert.ok(await page.locator('#instructionsPanel').isHidden());
  assert.ok(await page.locator('#exportTop').isDisabled());
  assert.equal(
    createHash('sha256')
      .update(await readFile(source))
      .digest('hex'),
    sha,
  );
  console.log(
    JSON.stringify({
      output,
      mappingReport: 'PASS',
      draftReload: 'PASS',
      trialActivation: 'PASS (mock server)',
      originalUnchanged: true,
      authentication: 'mock',
      serverWrites: 0,
      aiCalls: 0,
    }),
  );
} finally {
  await application.close();
}
