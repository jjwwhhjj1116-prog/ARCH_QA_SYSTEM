// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculate, reviewRows, numeric } from './engine';
import { canonicalRows, readWorkbook, suggestMapping } from './workbook';
import {
  defaultProfile,
  mappingSchema,
  type Profile,
  type Run,
} from './contracts';
import { exportReview } from './report';
import { unzipSync, strFromU8 } from 'fflate';

const version = '10000000-0000-4000-8000-000000000001';
function fixture(name = 'FIN_검수_합성산출서.csv') {
  const sheet = readWorkbook(readFileSync(`tests/fixtures/${name}`), 'csv')[0]!;
  const mapping = {
    ...suggestMapping(sheet, version, name),
    confirmed: true,
    arithmeticBasis: 'formula-result' as const,
    dimensionRole: 'length' as const,
    dimensionUnit: 'm',
    cohortConfirmed: true,
  };
  return {
    sheet,
    mapping,
    rows: canonicalRows(sheet, mapping, {
      sourceVersionId: version,
      filename: name,
      sha256: 'a'.repeat(64),
    }),
  };
}
describe('safe FIN arithmetic', () => {
  it.each([
    ['100*3*2', '600'],
    ['0.1+0.2', '0.3'],
    ['-(2+3)*2', '-10'],
    ['=10×3÷2', '15'],
  ])('%s = %s', (formula, expected) =>
    expect(calculate(formula)).toBe(expected),
  );
  it.each([
    'H*10',
    'SUM(A1:A2)',
    '1/0',
    '2(3)',
    '1..2',
    'process.exit()',
    '2+',
  ])('does not execute or invent %s', (formula) =>
    expect(() => calculate(formula)).toThrow(),
  );
  it('distinguishes blank, zero and thousands notation', () => {
    expect(numeric('')).toBeNull();
    expect(numeric('0')?.toFixed()).toBe('0');
    expect(numeric('1,234.5')?.toFixed()).toBe('1234.5');
    expect(numeric('1,2')).toBeNull();
  });
});
describe('evidence rules', () => {
  it('does not evaluate nonpositive cohorts or summary dimensions as detail peers', () => {
    const { rows } = fixture();
    const zeros = rows.slice(0, 6).map((r, i) => ({
      ...r,
      values: { ...r.values, dimension: i < 5 ? '0' : '100' },
    }));
    expect(reviewRows(zeros, defaultProfile).coverage[1]!.evaluated).toBe(0);
    const summary = {
      ...rows[5]!,
      id: 'summary',
      kind: 'building-summary' as const,
    };
    const result = reviewRows([...rows.slice(0, 6), summary], defaultProfile);
    expect(
      result.findings.filter(
        (f) => f.rowId === 'summary' && f.ruleId === 'DIM-001',
      ),
    ).toHaveLength(0);
  });
  it('inherits trade headers with zero or subtotal quantities', () => {
    const { sheet, mapping } = fixture('FIN_검수_동별집계표.csv');
    for (const row of sheet.rows)
      if (/^\d{2}$/.test(row.cells[0] ?? ''))
        row.cells[mapping.columns.quantity!] = '0';
    const rows = canonicalRows(sheet, mapping, {
      sourceVersionId: version,
      filename: '동별집계표.csv',
      sha256: 'a',
    });
    expect(
      reviewRows(rows, defaultProfile).findings[0]?.evidence.join(' '),
    ).toContain('미장공사 / 금속공사');
  });
  it('finds decimal suspicion separately from arithmetic mismatch and unreviewable', () => {
    const { rows } = fixture();
    const result = reviewRows(rows, defaultProfile);
    expect(result.findings.map((f) => f.ruleId).sort()).toEqual([
      'CALC-007',
      'DIM-001',
      'PARSE-008',
    ]);
    const decimal = result.findings.find((f) => f.ruleId === 'DIM-001')!;
    expect(decimal.candidate).toBe('10');
    expect(decimal.peerIds).toHaveLength(5);
    expect(decimal.evidence.join(' ')).toContain('J7');
    expect(
      result.findings.filter(
        (f) => f.rowId === decimal.rowId && f.ruleId === 'CALC-007',
      ),
    ).toHaveLength(0);
    expect(rows.find((r) => r.values.quantity === '-10')?.excluded).toBeNull();
    expect(result.coverage[0]!.unevaluated).toBeGreaterThan(0);
  });
  it('does not flag normal 100m or unknown dimension roles / too few peers', () => {
    const { rows } = fixture();
    const normal = rows.slice(0, 6).map((r) => ({
      ...r,
      values: {
        ...r.values,
        dimension: '100',
        formula: '100*3*2',
        quantity: '600',
      },
    }));
    expect(reviewRows(normal, defaultProfile).findings).toHaveLength(0);
    expect(
      reviewRows(rows.slice(4, 6), defaultProfile).findings.some(
        (f) => f.ruleId === 'DIM-001',
      ),
    ).toBe(false);
    expect(
      reviewRows(
        rows.map((r) => ({
          ...r,
          mapping: { ...r.mapping, dimensionRole: 'unknown' },
        })),
        defaultProfile,
      ).findings.some((f) => f.ruleId === 'DIM-001'),
    ).toBe(false);
  });
  it('applies conditions/exceptions to every rule and to peer membership', () => {
    const { rows } = fixture();
    const profile: Profile = {
      ...defaultProfile,
      exceptions: [{ field: 'trade', operator: 'equals', value: '도장공사' }],
    };
    expect(reviewRows(rows, profile).findings.map((f) => f.ruleId)).toEqual([
      'DIM-001',
    ]);
    const altered = rows.slice(0, 6).map((r, i) => ({
      ...r,
      values: { ...r.values, trade: i < 5 ? '제외공사' : '미장공사' },
    }));
    expect(
      reviewRows(altered, {
        ...defaultProfile,
        exceptions: [{ field: 'trade', operator: 'equals', value: '제외공사' }],
      }).findings,
    ).toHaveLength(0);
  });
  it('uses trade header rows in building summary and prevents unit/part conflation', () => {
    const { rows } = fixture('FIN_검수_동별집계표.csv');
    const result = reviewRows(rows, defaultProfile);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe('ITEM-018');
    expect(result.findings[0]!.peerIds).toHaveLength(1);
    expect(result.findings[0]!.evidence.join(' ')).toContain(
      '미장공사 / 금속공사',
    );
    expect(rows.find((r) => r.values.code === 'K777')!.fieldRefs.trade).toBe(
      'B5',
    );
  });
  it('rejects same-column self comparison at the API schema boundary', () => {
    const { mapping } = fixture();
    expect(mappingSchema.safeParse(mapping).success).toBe(true);
    expect(
      mappingSchema.safeParse({
        ...mapping,
        columns: { ...mapping.columns, formula: mapping.columns.quantity },
      }).success,
    ).toBe(false);
  });
  it('preserves finishing brick tiles and excludes confirmed masonry', () => {
    const { sheet, mapping } = fixture();
    expect(
      canonicalRows(sheet, mapping, {
        sourceVersionId: version,
        filename: '벽돌타일 마감.csv',
        sha256: 'a',
      })[0]!.excluded,
    ).toBeNull();
    expect(
      canonicalRows(sheet, mapping, {
        sourceVersionId: version,
        filename: '조적산출서(일반).csv',
        sha256: 'a',
      })[0]!.excluded,
    ).toContain('MASONRY_SCOPE');
  });
  it('is reproducible across repeated runs and handles 4000 peers without per-row sort', () => {
    const { rows } = fixture();
    const many = Array.from({ length: 4000 }, (_, index) => ({
      ...rows[0]!,
      id: `row-${index}`,
    }));
    const a = reviewRows(many, defaultProfile);
    expect(a.findings).toHaveLength(0);
    expect(a.coverage[1]!.evaluated).toBe(4000);
    expect(reviewRows(rows, defaultProfile)).toEqual(
      reviewRows(rows, defaultProfile),
    );
  });
  it('exports traceable XLSX with string cells, not executable formulas', () => {
    const { rows, mapping } = fixture();
    rows[0]!.values.item = '=HYPERLINK("https://example.invalid")';
    const run: Run = {
      ...reviewRows(rows, defaultProfile),
      id: 'run',
      projectId: 'project',
      caseId: 'case',
      actorId: 'actor',
      createdAt: '2026-09-07T00:00:00Z',
      trial: false,
      profile: defaultProfile,
      profileId: 'profile',
      profileVersion: 1,
      rows,
      mappings: [mapping],
      sources: [],
    };
    const files = unzipSync(exportReview(run, []));
    expect(Object.keys(files)).toContain('xl/worksheets/sheet3.xml');
    const xml = strFromU8(files['xl/worksheets/sheet1.xml']!);
    expect(xml).toContain('t="inlineStr"');
    expect(xml).not.toContain('<f>');
    expect(xml).toContain('CALC-007');
  });
});
