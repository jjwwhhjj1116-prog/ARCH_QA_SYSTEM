// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readWorkbook, parseCsv } from './workbook';

function xlsx(
  rows: string,
  extra: Record<string, string> = {},
  relationship = 'worksheets/sheet1.xml',
  declaration = '',
) {
  return zipSync(
    Object.fromEntries(
      Object.entries({
        'xl/workbook.xml':
          declaration +
          '<workbook><sheets><sheet name="내부 &amp; 공용" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Target="${relationship}"/></Relationships>`,
        'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows}</sheetData></worksheet>`,
        ...extra,
      }).map(([k, v]) => [k, strToU8(v)]),
    ),
  );
}
describe('bounded XLSX source reading', () => {
  it('preserves Korean, XML escapes, true zero, formulas and hidden rows', () => {
    const sheets = readWorkbook(
      xlsx(
        '<row r="2" hidden="1"><c r="A2" t="s"><v>0</v></c><c r="AA2"><v>0</v></c><c r="AB2"><f>SUM(A1:A2)</f><v>42</v></c></row>',
        { 'xl/sharedStrings.xml': '<sst><si><t>벽 &amp; 천장</t></si></sst>' },
      ),
      'xlsx',
    );
    expect(sheets[0]?.name).toBe('내부 & 공용');
    expect(sheets[0]?.rows[0]).toMatchObject({ number: 2, hidden: true });
    expect(sheets[0]?.rows[0]?.cells[0]).toBe('벽 & 천장');
    expect(sheets[0]?.rows[0]?.cells[26]).toBe('0');
    expect(sheets[0]?.rows[0]?.cells[27]).toBe('=SUM(A1:A2)');
  });
  it('rejects DTD and external worksheet paths without fetching', () => {
    expect(() =>
      readWorkbook(
        xlsx(
          '',
          {},
          'worksheets/sheet1.xml',
          '<!DOCTYPE a [<!ENTITY foo "x">]>',
        ),
        'xlsx',
      ),
    ).toThrow('외부 정의');
    expect(() => readWorkbook(xlsx('', {}, '../outside.xml'), 'xlsx')).toThrow(
      '외부 시트',
    );
  });
  it('rejects compact shared-string fanout before materializing giant evidence', () => {
    const rows = Array.from(
      { length: 600 },
      (_, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="s"><v>0</v></c></row>`,
    ).join('');
    expect(() =>
      readWorkbook(
        xlsx(rows, {
          'xl/sharedStrings.xml': `<sst><si><t>${'x'.repeat(8000)}</t></si></sst>`,
        }),
        'xlsx',
      ),
    ).toThrow('4MB');
  });
  it('keeps quoted CSV newline and distinguishes empty cells from zero', () => {
    expect(parseCsv('품명,물량\n"벽,\n미장",0\n천장,').rows[1]?.cells).toEqual([
      '벽,\n미장',
      '0',
    ]);
    expect(parseCsv('품명,물량\n천장,').rows[1]?.cells[1]).toBe('');
    expect(() => parseCsv('"닫히지 않음')).toThrow('따옴표');
  });
});
