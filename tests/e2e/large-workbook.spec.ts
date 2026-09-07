import { expect, test } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';

test('large FIN workbook reaches a persisted baseline through the Worker', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop-chromium',
    'Worker capacity is independent of viewport.',
  );
  test.setTimeout(120_000);
  const rowCount = 24000;
  const headers = ['부위', '품명', '규격', '단위', '산식', '물량'];
  const row = (values: string[], index: number) =>
    `<row r="${index}">${values.map((v, col) => `<c r="${String.fromCharCode(65 + col)}${index}" t="inlineStr"><is><t>${v}</t></is></c>`).join('')}${index > 2 ? `<c r="G${index}" s="${index}" custom="formatting-only-no-content"/>` : ''}</row>`;
  const xml = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${row(['내부산출서'], 1)}${row(headers, 2)}${Array.from({ length: rowCount }, (_, i) => row(['벽', `합성 도장 ${i}`, '시험 수성 도장 마감', 'M2', '10*3', '30'], i + 3)).join('')}</sheetData></worksheet>`;
  expect(strToU8(xml).byteLength).toBeGreaterThan(8 * 1024 * 1024);
  const data = zipSync(
    Object.fromEntries(
      Object.entries({
        '[Content_Types].xml':
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        '_rels/.rels':
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml':
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="내부산출서" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels':
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml': xml,
      }).map(([k, v]) => [k, strToU8(v)]),
    ),
    { level: 0 },
  );
  await page.goto('/');
  await expect(page.getByRole('status')).not.toContainText('불러오는 중');
  await expect(page.getByRole('status')).toContainText(
    '프로젝트를 불러왔습니다',
  );
  await page.getByRole('button', { name: '새 프로젝트 등록' }).click();
  await page
    .getByLabel('프로젝트명')
    .fill(`브라우저 통합 검수 LARGE${Date.now()}`);
  await page.getByRole('button', { name: '프로젝트 만들기' }).click();
  await page.getByRole('button', { name: '마감팀', exact: true }).click();
  await page.getByLabel('산출서와 집계표 선택').setInputFiles({
    name: '합성내부산출서.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(data),
  });
  await page.getByRole('button', { name: '원본 검사 후 저장' }).click();
  await expect(page.getByText('원본 저장 완료')).toBeVisible({
    timeout: 60_000,
  });
  await page
    .getByRole('group', { name: '자료 등록 상단 작업' })
    .getByRole('button', { name: /STEP 2 · AI 검수 시작/u })
    .click();
  const started = Date.now();
  await page
    .getByRole('button', { name: '전체 자료 확인 후 검수 시작', exact: true })
    .click();
  await expect(page.locator('.qc-results')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.qc-success')).toContainText('24,000행');
  await expect(page.locator('.qc-success')).toContainText('외부 AI 사용 0토큰');
  console.log(
    JSON.stringify({
      synthetic: true,
      rows: rowCount,
      xmlBytes: strToU8(xml).byteLength,
      uploadBytes: data.byteLength,
      reviewMs: Date.now() - started,
    }),
  );
});
