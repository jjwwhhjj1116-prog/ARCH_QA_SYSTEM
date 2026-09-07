// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readWorkbook, parseCsv, suggestMapping } from './workbook';
import { columnName } from './columns';
import { xmlFragments } from './xml-stream';

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
  it('streams a >8MB formatted worksheet without materializing blank rows', () => {
    const rows = Array.from(
      { length: 1400 },
      (_, i) =>
        `<row r="${i + 1}">${Array.from({ length: 256 }, (_, c) => `<c r="${columnName(c)}${i + 1}" s="${i * 256 + c}" custom="formatting">${i === 1 && c === 0 ? '<v>0</v>' : ''}</c>`).join('')}</row>`,
    ).join('');
    expect(strToU8(rows).byteLength).toBeGreaterThan(8 * 1024 * 1024);
    const sheet = readWorkbook(xlsx(rows), 'xlsx')[0]!;
    expect(sheet.rows).toEqual([{ number: 2, cells: ['0'], hidden: false }]);
  }, 15000);
  it('rejects truncated ZIP and XML instead of accepting partial data', () => {
    const data = xlsx('<row r="1"><c r="A1"><v>0</v></c></row>');
    expect(() => readWorkbook(data.slice(0, -30), 'xlsx')).toThrow('ZIP');
    const consume = xmlFragments('row', () => {});
    expect(() => consume('<worksheet><sheetData><row', true)).toThrow('XML');
  });
  it('never reads fake rows from comments, instructions, or extensions', () => {
    const rows: string[] = [];
    const consume = xmlFragments('row', (r) => rows.push(r));
    const text =
      '<worksheet><!-- <row r="9"/> --><?note <row r="8"/>?><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t><![CDATA[벽 & <천장>]]></t></is></c></row></sheetData><ext><row r="7"/></ext></worksheet>';
    for (let i = 0; i < text.length; i++)
      consume(text[i]!, i === text.length - 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('벽 &amp; &lt;천장&gt;');
  });
  it('bounds a single tag with many attributes before it finishes', () => {
    const consume = xmlFragments('row', () => {});
    expect(() =>
      consume(
        `<worksheet ${Array.from({ length: 100000 }, (_, i) => `a${i}="x"`).join(' ')}><sheetData/></worksheet>`,
        true,
      ),
    ).toThrow('토큰');
  });
  it.each([
    '<row><c r="A1"><v>0</v></c></row>',
    '<row r="2"><c r="A9"><v>0</v></c></row>',
    '<row r="2"><c r="A2junk"><v>0</v></c></row>',
    '<row r="2"><c r="A2"/><c r="A2"/></row>',
  ])('rejects ambiguous original addresses: %s', (rows) => {
    expect(() => readWorkbook(xlsx(rows), 'xlsx')).toThrow();
  });
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
      { length: 1200 },
      (_, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="s"><v>0</v></c></row>`,
    ).join('');
    expect(() =>
      readWorkbook(
        xlsx(rows, {
          'xl/sharedStrings.xml': `<sst><si><t>${'x'.repeat(8000)}</t></si></sst>`,
        }),
        'xlsx',
      ),
    ).toThrow('8MB');
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

describe('standard FIN recognition', () => {
  const id = '10000000-0000-4000-8000-000000000001';
  it.each([
    '부위,품명,규격,단위,산식,물량',
    '도형,부위,품명,규격,단위,산식,물량',
    '부위,층범위,품명,규격,단위,산식,층갯수,물량',
    '도형,부위,층범위,품명,규격,단위,산식,층갯수,물량',
  ])('recognizes %s but leaves calculation meaning unknown', (header) => {
    const values = header
      .split(',')
      .map(
        (h) =>
          ({ 품명: '미장', 단위: 'm2', 산식: '100*3', 물량: '300' })[h] ?? '',
      );
    const mapping = suggestMapping(
      parseCsv(`내 부 산 출 서\n현장\n동\n${header}\n${values.join(',')}`),
      id,
      '내부산출서.xlsx',
    );
    expect(mapping.confirmed).toBe(true);
    expect(mapping.headerRow).toBe(4);
    expect(mapping.columns.quantity).toBe(header.split(',').indexOf('물량'));
    expect(mapping.arithmeticBasis).toBe('unknown');
    expect(mapping.dimensionRole).toBe('unknown');
    expect(mapping.cohortConfirmed).toBe(false);
    expect(mapping.recognition?.version).toBe(1);
  });
  it('requires compatible report title and repeated headers', () => {
    const csv =
      '창호 리스트\n부위,품명,규격,단위,산식,물량\n벽,미장,T10,m2,10,10';
    expect(suggestMapping(parseCsv(csv), id, '내부산출서.xlsx').confirmed).toBe(
      false,
    );
    const changed =
      csv.replace('창호 리스트', '내부산출서') +
      '\n품명,부위,규격,단위,산식,물량\n미장,벽,T10,m2,10,10';
    expect(
      suggestMapping(parseCsv(changed), id, '내부산출서.xlsx').confirmed,
    ).toBe(false);
  });
  it('recognizes building summary without guessing dimension or part', () => {
    const m = suggestMapping(
      parseCsv(
        '동 별 집 계 표\n코드,품명,규격,단위,합계,101동\nM01,미장,T10,m2,10,10',
      ),
      id,
      '동별집계표.xlsx',
    );
    expect(m).toMatchObject({
      confirmed: true,
      kind: 'building-summary',
      columns: { quantity: 4, part: null, dimension: null },
    });
  });
});
