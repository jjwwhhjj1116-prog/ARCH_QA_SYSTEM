import { XMLParser } from 'fast-xml-parser';
import { streamXml, xmlFragments, WorkbookError } from './xml-stream';
export { WorkbookError } from './xml-stream';
import { columnName } from './columns';
import {
  fields,
  type CanonicalRow,
  type Field,
  type Mapping,
  type Sheet,
  type SourceRef,
} from './contracts';

const MAX_ROWS = 12000;
const list = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
// Decode standard XML escapes only; DTD/entity declarations are rejected before parsing.
const xml = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
  isArray: (name) =>
    ['row', 'c', 'si', 'sheet', 'Relationship', 'r'].includes(name),
});
type XmlText = string | { '#text'?: string };
type RichText = { t?: XmlText; r?: { t?: XmlText }[] };
type WorkbookXml = {
  sst?: { si?: RichText[] };
  workbook?: {
    sheets?: {
      sheet?: { '@_r:id'?: string; '@_name'?: string; '@_state'?: string }[];
    };
  };
  Relationships?: {
    Relationship?: {
      '@_Id'?: string;
      '@_Target'?: string;
      '@_TargetMode'?: string;
    }[];
  };
  worksheet?: {
    sheetData?: {
      row?: {
        '@_r'?: string;
        '@_hidden'?: string;
        c?: {
          '@_r'?: string;
          '@_t'?: string;
          v?: XmlText;
          f?: XmlText;
          is?: RichText;
        }[];
      }[];
    };
  };
};
function parseXml(text: string | undefined): WorkbookXml {
  if (!text) throw new WorkbookError('워크북의 필수 XML이 없습니다.');
  if (/<!DOCTYPE|<!ENTITY/iu.test(text))
    throw new WorkbookError('외부 정의가 포함된 XML은 읽지 않습니다.');
  return xml.parse(text) as WorkbookXml;
}
function stringValue(value: XmlText | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'object') return String(value);
  return String(value['#text'] ?? '');
}
function sharedText(value: RichText | undefined): string {
  if (value?.t !== undefined) return stringValue(value.t);
  return list(value?.r)
    .map((r) => stringValue(r.t))
    .join('');
}
function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/u)?.[0];
  if (!letters) throw new WorkbookError('셀 주소를 확인할 수 없습니다.');
  return (
    letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
  );
}
export function parseCsv(text: string): Sheet {
  if (new TextEncoder().encode(text).byteLength > 4 * 1024 * 1024)
    throw new WorkbookError(
      'CSV 내용이 검수 한도 4MB를 넘었습니다. 원본은 보존되며 파일 분할이 필요합니다.',
    );
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!cell || quoted) quoted = !quoted;
      else cell += char;
    } else if (char === ',' && !quoted) {
      record.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else cell += char;
    if (cell.length > 8192 || record.length > 255 || records.length > MAX_ROWS)
      throw new WorkbookError(
        '검수 한도(12,000행·256열·셀 8KB)를 넘었습니다. 파일을 나눠 주세요.',
      );
  }
  if (quoted) throw new WorkbookError('CSV 따옴표가 닫히지 않았습니다.');
  if (cell || record.length) records.push([...record, cell]);
  return {
    name: 'CSV',
    rows: records.map((cells, index) => ({
      number: index + 1,
      cells,
      hidden: false,
    })),
  };
}
export function readWorkbook(
  bytes: Uint8Array,
  format: 'xlsx' | 'csv',
): Sheet[] {
  if (bytes.length > 20 * 1024 * 1024)
    throw new WorkbookError('파일당 검수 한도는 20MB입니다.');
  if (format === 'csv') {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder('euc-kr', { fatal: true }).decode(bytes);
    }
    return [parseCsv(text.replace(/^\uFEFF/u, ''))];
  }
  const files: Record<string, string> = {};
  streamXml(bytes, (name) => {
    if (!['xl/workbook.xml', 'xl/_rels/workbook.xml.rels'].includes(name))
      return;
    files[name] = '';
    return (text) => {
      files[name] += text;
      if (files[name]!.length > 256 * 1024)
        throw new WorkbookError('워크북 메타데이터 한도를 넘었습니다.');
    };
  });
  const strings: string[] = [];
  let stringBytes = 0;
  streamXml(bytes, (name) =>
    name === 'xl/sharedStrings.xml'
      ? xmlFragments('si', (fragment) => {
          const value = sharedText(
            list(parseXml(`<sst>${fragment}</sst>`).sst?.si)[0],
          );
          stringBytes += new TextEncoder().encode(value).byteLength;
          if (
            stringBytes > 4 * 1024 * 1024 ||
            strings.length >= 100000 ||
            value.length > 8192
          )
            throw new WorkbookError(
              '공유 문자열의 검수 한도 4MB·10만 개·셀 8KB를 넘었습니다.',
            );
          strings.push(value);
        })
      : undefined,
  );
  const workbook = parseXml(files['xl/workbook.xml']);
  const rels = list(
    parseXml(files['xl/_rels/workbook.xml.rels']).Relationships?.Relationship,
  );
  const sheets = list(workbook.workbook?.sheets?.sheet);
  if (sheets.length > 30)
    throw new WorkbookError('검수 한도는 파일당 30개 시트입니다.');
  let rowTotal = 0;
  let cellBytes = 0;
  const targets = new Map<
    string,
    { sheet: (typeof sheets)[number]; result: Sheet }
  >();
  for (const sheet of sheets) {
    const rel = rels.find((r) => r['@_Id'] === sheet['@_r:id']);
    const target = String(rel?.['@_Target'] ?? '');
    if (rel?.['@_TargetMode'] === 'External' || target.includes('..'))
      throw new WorkbookError('외부 시트 연결은 검수하지 않습니다.');
    const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
    if (!/^xl\/worksheets\/[^/]+\.xml$/u.test(path) || targets.has(path))
      throw new WorkbookError('시트 경로가 올바르지 않거나 중복되었습니다.');
    targets.set(path, {
      sheet,
      result: { name: String(sheet['@_name']), rows: [] },
    });
  }
  const found = new Set<string>();
  let physicalRows = 0;
  streamXml(bytes, (name) => {
    const target = targets.get(name);
    if (!target) return;
    found.add(name);
    const { sheet, result } = target;
    let previousRow = 0;
    return xmlFragments('row', (fragment) => {
      const row = list(
        parseXml(`<worksheet><sheetData>${fragment}</sheetData></worksheet>`)
          .worksheet?.sheetData?.row,
      )[0];
      if (!row) throw new WorkbookError('행 구조를 읽지 못했습니다.');
      const rowNumber = Number(row['@_r']);
      if (
        !Number.isInteger(rowNumber) ||
        rowNumber < 1 ||
        rowNumber > 1048576 ||
        previousRow >= rowNumber
      )
        throw new WorkbookError(
          '원본 행 번호가 없거나 순서·범위가 올바르지 않습니다.',
        );
      previousRow = rowNumber;
      if (++physicalRows > 200000)
        throw new WorkbookError('서식 포함 20만 행의 검수 한도를 넘었습니다.');
      const cells: string[] = [];
      const addresses = new Set<string>();
      for (const c of list(row.c)) {
        const address = String(c['@_r'] ?? '');
        if (
          !/^[A-Z]+[1-9]\d*$/u.test(address) ||
          Number(address.match(/\d+$/u)?.[0]) !== rowNumber ||
          addresses.has(address)
        )
          throw new WorkbookError(
            '셀 주소가 원본 행과 다르거나 중복되었습니다.',
          );
        addresses.add(address);
        const index = columnIndex(address);
        if (index > 255)
          throw new WorkbookError('검수 한도 256열을 넘었습니다.');
        const sharedIndex = Number(stringValue(c.v));
        if (
          c['@_t'] === 's' &&
          (!Number.isInteger(sharedIndex) ||
            sharedIndex < 0 ||
            sharedIndex >= strings.length)
        )
          throw new WorkbookError('공유 문자열 참조가 올바르지 않습니다.');
        const value =
          c['@_t'] === 's'
            ? (strings[Number(stringValue(c.v))] ?? '')
            : c['@_t'] === 'inlineStr'
              ? sharedText(c.is)
              : c.f !== undefined
                ? '=' + stringValue(c.f)
                : stringValue(c.v);
        cellBytes += new TextEncoder().encode(value).byteLength;
        if (cellBytes > 4 * 1024 * 1024)
          throw new WorkbookError(
            '공유 문자열을 펼친 셀 내용이 검수 한도 4MB를 넘었습니다. 원본은 보존됩니다.',
          );
        if (value.length > 8192)
          throw new WorkbookError('셀 내용이 검수 한도를 넘었습니다.');
        if (value) cells[index] = value;
      }
      // Formatting-only rows consume no semantic row budget; their source row
      // numbers are never renumbered. Zero and formulas remain actual content.
      if (!cells.some((c) => c)) return;
      if (++rowTotal > MAX_ROWS)
        throw new WorkbookError(
          '내용이 있는 12,000행 한도를 넘었습니다. 일부만 정상 처리하지 않습니다.',
        );
      result.rows.push({
        number: rowNumber,
        cells: Array.from(cells, (c) => c ?? ''),
        hidden:
          row['@_hidden'] === '1' ||
          sheet['@_state'] === 'hidden' ||
          sheet['@_state'] === 'veryHidden',
      });
    });
  });
  if ([...targets.keys()].some((name) => !found.has(name)))
    throw new WorkbookError('워크북의 필수 시트 XML이 없습니다.');
  return [...targets.values()].map((t) => t.result);
}
const aliases: Record<Field, string[]> = {
  item: ['품명', '재료명', '자재명', '아이템명'],
  spec: ['규격'],
  unit: ['단위'],
  formula: ['산식', '산출식'],
  quantity: ['물량', '산출물량', '수량', '합계'],
  trade: ['공종', '공사명'],
  part: ['부위'],
  code: ['코드', '재료코드', '품목코드'],
  scope: ['동층실', '범위', '위치'],
  dimension: ['검수치수', '길이', '높이', '두께', '개소'],
  cohort: ['비교집단', '동일타입'],
};
const clean = (s: string) => s.replace(/\s/gu, '').toLowerCase();
export function suggestMapping(
  sheet: Sheet,
  sourceVersionId: string,
  filename: string,
): Mapping {
  const candidates = sheet.rows
    .slice(0, 60)
    .map((row) => ({
      row,
      score: fields.filter((f) =>
        row.cells.some((c) => aliases[f].some((a) => clean(a) === clean(c))),
      ).length,
    }))
    .sort((a, b) => b.score - a.score);
  const header = candidates[0]?.row;
  const columns = Object.fromEntries(
    fields.map((f) => {
      const index =
        header?.cells.findIndex((c) =>
          aliases[f].some((a) => clean(a) === clean(c)),
        ) ?? -1;
      return [f, index < 0 ? null : index];
    }),
  ) as Mapping['columns'];
  const mapping: Mapping = {
    sourceVersionId,
    sheet: sheet.name,
    headerRow: header?.number ?? 1,
    kind: /동별?집계/u.test(filename)
      ? 'building-summary'
      : /산출서|산출근거/u.test(filename)
        ? 'detail'
        : 'reference',
    columns,
    confirmed: false,
    arithmeticBasis: 'unknown',
    dimensionRole: 'unknown',
    dimensionUnit: '',
    cohortConfirmed: false,
  };
  const headerText = header?.cells.map(clean) ?? [];
  const detailLayouts = [
    '부위|품명|규격|단위|산식|물량',
    '도형|부위|품명|규격|단위|산식|물량',
    '부위|층범위|품명|규격|단위|산식|층갯수|물량',
    '도형|부위|층범위|품명|규격|단위|산식|층갯수|물량',
  ];
  const title = sheet.rows
    .filter((r) => r.number < mapping.headerRow)
    .flatMap((r) => r.cells)
    .map(clean)
    .join(' ');
  const detail =
    detailLayouts.includes(headerText.join('|')) &&
    /산출서/u.test(filename) &&
    /산출서/u.test(title);
  const summary =
    headerText.slice(0, 5).join('|') === '코드|품명|규격|단위|합계' &&
    /동별집계표/u.test(clean(filename)) &&
    /동별집계표/u.test(title);
  const shiftedHeaders = sheet.rows.some(
    (r) =>
      r.number > mapping.headerRow &&
      r.cells.some((c) => clean(c) === '품명') &&
      r.cells.some((c) => clean(c) === '단위') &&
      r.cells.map(clean).join('|') !== headerText.join('|'),
  );
  const hasContent = sheet.rows.some(
    (r) =>
      r.number > mapping.headerRow &&
      !!r.cells[columns.item ?? -1]?.trim() &&
      !!r.cells[columns.unit ?? -1]?.trim() &&
      clean(r.cells[columns.item ?? -1] ?? '') !== '품명',
  );
  if ((detail || summary) && !shiftedHeaders && hasContent) {
    mapping.kind = summary ? 'building-summary' : 'detail';
    mapping.confirmed = true;
    mapping.recognition = {
      layout: summary
        ? 'fin-building-summary'
        : `fin-detail-${headerText.length}`,
      version: 1,
    };
  }
  return mapping;
}
export function canonicalRows(
  sheet: Sheet,
  mapping: Mapping,
  source: Omit<SourceRef, 'sheet' | 'row' | 'cell'>,
): CanonicalRow[] {
  if (!mapping.confirmed) return [];
  let tradeContext = '';
  let tradeRow = 0;
  return sheet.rows
    .filter(
      (r) => r.number > mapping.headerRow && r.cells.some((c) => c.trim()),
    )
    .map((row) => {
      const values = Object.fromEntries(
        fields.map((f) => [
          f,
          mapping.columns[f] === null
            ? ''
            : (row.cells[mapping.columns[f]!] ?? ''),
        ]),
      ) as Record<Field, string>;
      const populated = row.cells.filter((c) => c.trim());
      let excluded: string | null = null;
      if (row.hidden) excluded = '숨김 행 · 검토 범위 확인 필요';
      const tradeHeader =
        mapping.kind === 'building-summary' &&
        /^\d{2}$/u.test(values.code.trim()) &&
        /공사|공종/u.test(values.item) &&
        !values.unit.trim() &&
        !values.spec.trim();
      if (tradeHeader) {
        tradeContext = values.item.trim();
        tradeRow = row.number;
        excluded = '공종 구분행 · 이후 아이템의 공종 문맥';
      } else if (
        mapping.kind === 'building-summary' &&
        !values.trade &&
        tradeContext
      )
        values.trade = tradeContext;
      if (
        /^조적산출서(?:[(_（]|\.)/u.test(source.filename) ||
        /^(조적|벽돌|블록)공사$/u.test(clean(values.trade))
      )
        excluded = 'MASONRY_SCOPE · 조적 후속 범위';
      else if (
        /^(소계|합계|총계|공종계|층계|동계)$/u.test(clean(values.item)) ||
        populated.some((c) => /^(소계|총계)$/u.test(clean(c)))
      )
        excluded = '소계·총계 · 상세행 이중 합산 제외';
      else if (!values.item.trim())
        excluded = '품명 없는 문맥·변수 행 · 상세항목 미확정';
      else if (aliases.item.some((a) => clean(a) === clean(values.item)))
        excluded = '반복 머리글';
      else if (/^\[?비고\]?$/u.test(clean(values.item)))
        excluded = '비고 문맥행';
      const fieldRefs = Object.fromEntries(
        fields
          .filter((f) => mapping.columns[f] !== null)
          .map((f) => [f, columnName(mapping.columns[f]!) + row.number]),
      );
      if (mapping.columns.trade === null && values.trade && tradeRow)
        fieldRefs.trade = columnName(mapping.columns.item ?? 0) + tradeRow;
      return {
        id: `${source.sourceVersionId}:${sheet.name}:${row.number}`,
        ref: {
          ...source,
          sheet: sheet.name,
          row: row.number,
          cell:
            columnName(
              mapping.columns.formula ??
                mapping.columns.quantity ??
                mapping.columns.item ??
                0,
            ) + row.number,
        },
        values,
        original: row.cells,
        kind: mapping.kind,
        mapping,
        excluded,
        fieldRefs,
      };
    });
}
