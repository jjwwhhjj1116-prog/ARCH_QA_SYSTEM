import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('project page exposes the full Korean workflow and persists a new project', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '검수 프로젝트', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText('산출서와 집계표', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('status')).not.toContainText('불러오는 중');
  const code = `E2E${testInfo.project.name.replace(/\W/gu, '').toUpperCase()}${Date.now()}`;
  await page.getByRole('button', { name: '새 프로젝트' }).click();
  await page.getByLabel('프로젝트 코드').fill(code);
  await page.getByLabel('프로젝트명').fill('브라우저 통합 검수');
  await page.getByLabel('발주처·고객사 (선택)').fill('로컬 자동시험');
  await page.getByRole('button', { name: '프로젝트 만들기' }).click();
  await expect(
    page.getByRole('row', { name: new RegExp(code, 'u') }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: '프로젝트 검색' }).fill(code);
  const projectRow = page.getByRole('row', { name: new RegExp(code, 'u') });
  await expect(projectRow).toBeVisible();
  await projectRow.getByRole('button', { name: '검수 열기' }).click();
  await expect(
    page.getByRole('heading', { name: '브라우저 통합 검수', level: 2 }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'FIN 검수 추가' }).click();
  await expect(
    page.getByText('브라우저 통합 검수 FIN 검수 1', { exact: true }),
  ).toBeVisible();
  const selectedResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(selectedResults.violations).toEqual([]);
  await expect(page.getByText('초안', { exact: true })).toBeVisible();
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
    page.getByRole('row', { name: new RegExp(code, 'u') }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: '프로젝트 검색' }).fill(code);
  await page
    .getByRole('row', { name: new RegExp(code, 'u') })
    .getByRole('button', { name: '검수 열기' })
    .click();
  await expect(
    page.getByText('브라우저 통합 검수 FIN 검수 1', { exact: true }),
  ).toBeVisible();
});

test('critical accessibility scan has no violations', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '검수 프로젝트', level: 1 }),
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
  const menuButton = page.getByRole('button', { name: '메뉴 열기' });
  await menuButton.click();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('navigation').getByText('검수 프로젝트'),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation').getByText('자료 라이브러리'),
  ).toBeVisible();
  const closeButton = page.getByRole('button', { name: '메뉴 닫기' }).first();
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    page.getByRole('navigation').getByRole('button', { name: '검수 프로젝트' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  await expect(menuButton).toBeFocused();
});
