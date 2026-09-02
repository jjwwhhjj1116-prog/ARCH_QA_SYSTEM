import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function setLocalProjectRole(
  projectId: string,
  role: 'workspace_admin' | 'viewer',
): void {
  if (!/^[0-9a-f-]{36}$/u.test(projectId)) {
    throw new Error('E2E 프로젝트 식별자가 올바르지 않습니다.');
  }
  const statement =
    `UPDATE project_member SET role = '${role}' ` +
    `WHERE project_id = '${projectId}' AND user_id = 'local-user-owner'`;
  runLocalD1(statement);
}

function setUploadCreator(uploadId: string, actorId: string): void {
  if (!/^[0-9a-f-]{36}$/u.test(uploadId)) {
    throw new Error('E2E 업로드 식별자가 올바르지 않습니다.');
  }
  if (!/^[a-z0-9-]{1,80}$/u.test(actorId)) {
    throw new Error('E2E 사용자 식별자가 올바르지 않습니다.');
  }
  runLocalD1(
    `INSERT OR IGNORE INTO user_profile (id, email, display_name, created_at) ` +
      `VALUES ('${actorId}', '${actorId}@example.test', '다른 등록자', 0)`,
  );
  runLocalD1(
    `UPDATE upload_attempt SET created_by = '${actorId}' WHERE id = '${uploadId}'`,
  );
}

function runLocalD1(statement: string): void {
  const wranglerCli = resolve('node_modules/wrangler/bin/wrangler.js');
  const result = spawnSync(
    process.execPath,
    [
      wranglerCli,
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      'wrangler.local.jsonc',
      '--command',
      statement,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WRANGLER_WRITE_LOGS: 'false',
        WRANGLER_LOG_PATH: '.wrangler/logs',
      },
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `E2E 로컬 D1 변경에 실패했습니다. ${result.stderr || result.stdout}`,
    );
  }
}

test('project page exposes the full Korean workflow and persists a new project', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: '검수 프로젝트를 선택하세요',
      level: 1,
    }),
  ).toBeVisible();
  await expect(page.getByRole('status')).not.toContainText('불러오는 중');
  const testToken = `${testInfo.project.name.replace(/\W/gu, '').toUpperCase()}${Date.now()}`;
  const projectName = `브라우저 통합 검수 ${testToken}`;
  await page.getByRole('button', { name: '새 프로젝트 등록' }).click();
  await page.getByLabel('프로젝트명').fill(projectName);
  await page.getByLabel('발주처·고객사 (선택)').fill('로컬 자동시험');
  await page.getByRole('button', { name: '프로젝트 만들기' }).click();
  await expect(
    page.getByRole('heading', {
      name: '산출서와 집계표를 등록하세요',
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('먼저 팀별 검수 케이스를 만드세요.', { exact: true }),
  ).toBeVisible();
  const addFinishCase = page.getByRole('button', { name: '마감팀 케이스' });
  await expect(addFinishCase).toBeEnabled();
  await addFinishCase.click();
  await expect(
    page.getByText(`${projectName} 마감 검수 1`, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: '산출서와 집계표 등록', exact: true })
    .click();
  await page.getByLabel('산출서와 집계표 선택').setInputFiles([
    {
      name: 'ＵＩ내부산출서.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('품명,수량\n도장,12.5\n', 'utf8'),
    },
    {
      name: 'UI동별집계표.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('동,합계\n101동,20\n', 'utf8'),
    },
  ]);
  await expect(
    page.getByText('ＵＩ내부산출서.csv', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '원본 검사 후 저장' }).click();
  await expect(page.locator('.system-message')).toContainText(
    '2개 산출서와 집계표를 저장했습니다',
  );
  const selectedResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(selectedResults.violations).toEqual([]);
  await expect(page.getByText('초안', { exact: true })).toBeVisible();
  const projectsResponse = await page.request.get('/api/projects');
  expect(projectsResponse.status()).toBe(200);
  const projectsBody = (await projectsResponse.json()) as {
    data: Array<{ id: string; code: string; name: string }>;
  };
  const projectId = projectsBody.data.find(
    (project) => project.name === projectName,
  )?.id;
  expect(projectId).toBeTruthy();
  const casesResponse = await page.request.get(
    `/api/projects/${projectId}/cases`,
  );
  expect(casesResponse.status()).toBe(200);
  const casesBody = (await casesResponse.json()) as {
    data: Array<{ id: string; name: string }>;
  };
  const caseId = casesBody.data.find(
    (reviewCase) => reviewCase.name === `${projectName} 마감 검수 1`,
  )?.id;
  expect(caseId).toBeTruthy();
  const takeoffBody = Buffer.from('품명,수량\n도장,12.5\n', 'utf8');
  const summaryBody = Buffer.from('동,합계\n101동,20\n', 'utf8');
  const packagePayload = {
    displayName: '브라우저 산출서와 집계표',
    files: [
      {
        filename: '내부산출서.csv',
        contentType: 'text/csv',
        sizeBytes: takeoffBody.byteLength,
        purpose: 'quantity_source',
      },
      {
        filename: '동별집계표.csv',
        contentType: 'text/csv',
        sizeBytes: summaryBody.byteLength,
        purpose: 'quantity_source',
      },
    ],
  };
  const packageHeaders = {
    'idempotency-key': `package-${testToken}`,
    'sec-fetch-site': 'same-origin',
  };
  const packageUrl = `/api/projects/${projectId}/cases/${caseId}/source-packages`;
  const packageResponse = await page.request.post(packageUrl, {
    data: packagePayload,
    headers: packageHeaders,
  });
  expect(packageResponse.status()).toBe(201);
  const packageBody = await packageResponse.json();
  expect(packageBody.data).toMatchObject({
    projectId,
    reviewCaseId: caseId,
    status: 'receiving',
    projectIdentityStatus: 'pending',
  });
  expect(packageBody.data.files).toHaveLength(2);
  expect(JSON.stringify(packageBody)).not.toContain('r2ObjectKey');
  expect(JSON.stringify(packageBody)).not.toContain('uploadPath');
  const takeoffIntent = packageBody.data.files.find(
    (file: { filename: string }) => file.filename === '내부산출서.csv',
  );
  const summaryIntent = packageBody.data.files.find(
    (file: { filename: string }) => file.filename === '동별집계표.csv',
  );
  setLocalProjectRole(projectId!, 'viewer');
  try {
    const deniedUpload = await page.request.put(
      `/api/uploads/${takeoffIntent.uploadId}/bytes`,
      {
        data: takeoffBody,
        headers: {
          'content-type': 'application/octet-stream',
          'sec-fetch-site': 'same-origin',
        },
      },
    );
    expect(deniedUpload.status()).toBe(403);
  } finally {
    setLocalProjectRole(projectId!, 'workspace_admin');
  }
  setUploadCreator(takeoffIntent.uploadId, 'other-package-creator');
  const invalidTakeoff = Buffer.from(takeoffBody);
  invalidTakeoff[0] = 0xff;
  const failedCollaboratorUpload = await page.request.put(
    `/api/uploads/${takeoffIntent.uploadId}/bytes`,
    {
      data: invalidTakeoff,
      headers: {
        'content-type': 'application/octet-stream',
        'sec-fetch-site': 'same-origin',
      },
    },
  );
  expect(failedCollaboratorUpload.status()).toBe(400);
  const storedTakeoff = await page.request.put(
    `/api/uploads/${takeoffIntent.uploadId}/bytes`,
    {
      data: takeoffBody,
      headers: {
        'content-type': 'application/octet-stream',
        'sec-fetch-site': 'same-origin',
      },
    },
  );
  expect(storedTakeoff.status()).toBe(200);
  expect((await storedTakeoff.json()).data).toMatchObject({
    status: 'stored',
    packageStatus: 'receiving',
  });
  const storedSummary = await page.request.put(
    `/api/uploads/${summaryIntent.uploadId}/bytes`,
    {
      data: summaryBody,
      headers: {
        'content-type': 'application/octet-stream',
        'sec-fetch-site': 'same-origin',
      },
    },
  );
  expect(storedSummary.status()).toBe(200);
  expect((await storedSummary.json()).data).toMatchObject({
    status: 'stored',
    packageStatus: 'stored_unverified',
  });
  const sameBytesRetry = await page.request.put(
    `/api/uploads/${takeoffIntent.uploadId}/bytes`,
    {
      data: takeoffBody,
      headers: {
        'content-type': 'application/octet-stream',
        'sec-fetch-site': 'same-origin',
      },
    },
  );
  expect(sameBytesRetry.status()).toBe(200);
  const changedBytes = Buffer.from(takeoffBody);
  changedBytes[changedBytes.length - 2] ^= 1;
  const changedRetry = await page.request.put(
    `/api/uploads/${takeoffIntent.uploadId}/bytes`,
    {
      data: changedBytes,
      headers: {
        'content-type': 'application/octet-stream',
        'sec-fetch-site': 'same-origin',
      },
    },
  );
  expect(changedRetry.status()).toBe(409);
  const retryResponse = await page.request.post(packageUrl, {
    data: packagePayload,
    headers: packageHeaders,
  });
  expect(retryResponse.status()).toBe(201);
  const replayedPackage = (await retryResponse.json()).data;
  expect(replayedPackage.id).toBe(packageBody.data.id);
  expect(replayedPackage.status).toBe('stored_unverified');
  expect(
    replayedPackage.files.every(
      (file: { status: string }) => file.status === 'stored',
    ),
  ).toBe(true);
  const conflictResponse = await page.request.post(packageUrl, {
    data: { ...packagePayload, displayName: '다른 묶음' },
    headers: packageHeaders,
  });
  expect(conflictResponse.status()).toBe(409);
  const secondCaseResponse = await page.request.post(
    `/api/projects/${projectId}/cases`,
    {
      data: { name: '브라우저 통합 검수 RC 검수 2', discipline: 'RC' },
      headers: { 'sec-fetch-site': 'same-origin' },
    },
  );
  expect(secondCaseResponse.status()).toBe(201);
  const secondCaseId = (await secondCaseResponse.json()).data.id as string;
  const sameKeyOtherCase = await page.request.post(
    `/api/projects/${projectId}/cases/${secondCaseId}/source-packages`,
    { data: packagePayload, headers: packageHeaders },
  );
  expect(sameKeyOtherCase.status()).toBe(201);
  const otherCasePackage = await sameKeyOtherCase.json();
  expect(otherCasePackage.data.reviewCaseId).toBe(secondCaseId);
  expect(otherCasePackage.data.id).not.toBe(packageBody.data.id);
  const mixedScope = await page.request.post(
    `/api/projects/99999999-9999-4999-8999-999999999999/cases/${caseId}/source-packages`,
    {
      data: packagePayload,
      headers: {
        'idempotency-key': `mixed-${testToken}`,
        'sec-fetch-site': 'same-origin',
      },
    },
  );
  expect(mixedScope.status()).toBe(403);
  const denied = await page.request.post(
    '/api/projects/99999999-9999-4999-8999-999999999999/cases',
    {
      data: { name: '교차 프로젝트 공격', discipline: 'FIN' },
      headers: { 'sec-fetch-site': 'same-origin' },
    },
  );
  expect(denied.status()).toBe(403);
  await page.reload();
  await expect(
    page.getByRole('row', { name: new RegExp(projectName, 'u') }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: '프로젝트 검색' }).fill(projectName);
  await page
    .getByRole('row', { name: new RegExp(projectName, 'u') })
    .getByRole('button', { name: '선택하고 자료 등록' })
    .click();
  await expect(
    page.getByText(`${projectName} 마감 검수 1`, { exact: true }),
  ).toBeVisible();
});

test('critical accessibility scan has no violations', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: '검수 프로젝트를 선택하세요',
      level: 1,
    }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('mobile navigation opens with readable text labels', async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith('mobile'),
    'mobile-only interaction',
  );
  await page.goto('/');
  await expect(page.getByRole('status')).not.toContainText('불러오는 중');
  const menuButton = page.locator(
    '.topbar button[aria-controls="primary-navigation"]',
  );
  await expect(page.getByRole('navigation')).toBeHidden();
  await menuButton.click();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.workspace')).toHaveAttribute('inert', '');
  await expect(page.locator('.workspace')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  await expect(
    page.getByRole('navigation').getByText('프로젝트 등록'),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation').getByText('산출식 AI 검수'),
  ).toBeVisible();
  const closeButton = page.getByRole('button', { name: '메뉴 닫기' }).first();
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    page.getByRole('navigation').getByRole('button', { name: '설정' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('navigation')).toBeHidden();
  await expect(page.locator('.workspace')).not.toHaveAttribute('inert', '');
  await expect(menuButton).toBeFocused();
});
