// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  baselineSource,
  combineBaseline,
  packEvidence,
  unpackEvidence,
} from './baseline';
import { fields, type Mapping, type Sheet } from './contracts';
const source = {
  sourceVersionId: '10000000-0000-4000-8000-000000000001',
  filename: '동별집계표.xlsx',
  sha256: 'a'.repeat(64),
};
function fixture(kind: Mapping['kind'], rows: string[][]) {
  const mapping: Mapping = {
    sourceVersionId: source.sourceVersionId,
    sheet: '합성',
    headerRow: 1,
    kind,
    confirmed: true,
    columns: {
      ...Object.fromEntries(fields.map((f) => [f, null])),
      item: 0,
      spec: 1,
      unit: 2,
      formula: 3,
      quantity: 4,
      code: 5,
      trade: 6,
      part: 7,
    } as Mapping['columns'],
    arithmeticBasis: 'unknown',
    dimensionRole: 'unknown',
    dimensionUnit: '',
    cohortConfirmed: false,
  };
  const sheet: Sheet = {
    name: '합성',
    rows: [
      {
        number: 1,
        cells: [
          '품명',
          '규격',
          '단위',
          '산식',
          '물량',
          '재료코드',
          '공종',
          '부위',
        ],
        hidden: false,
      },
      ...rows.map((cells, i) => ({ number: i + 2, cells, hidden: false })),
    ],
  };
  return baselineSource([sheet], source, [mapping]);
}
describe('product baseline is not approval or a completeness claim', () => {
  it('does not mark missing code/trade as evaluated or normal', () => {
    const result = combineBaseline([
      fixture('building-summary', [
        ['미장', 'T10', '㎡', '', '1', '', '', '벽'],
        ['미장', 'T10', '㎡', '', '2', '', '', '벽'],
      ]),
    ]);
    expect(result.coverage.find((c) => c.ruleId === 'ITEM-018')).toMatchObject({
      evaluated: 0,
      unevaluated: 2,
    });
    expect(result.coverage[2]?.reasons.join(' ')).toContain('공종');
    expect(result.findings).toHaveLength(0);
  });
  it('finds same-name items across trades but keeps unit and part boundaries', () => {
    const result = combineBaseline([
      fixture('building-summary', [
        ['미장', 'T10', '㎡', '', '1', 'A', '미장공사', '벽'],
        ['미장', 'T10', 'm2', '', '2', 'B', '금속공사', '벽'],
        ['미장', 'T10', 'm3', '', '2', 'C', '금속공사', '벽'],
        ['미장', 'T10', '㎡', '', '2', 'D', '금속공사', '바닥'],
      ]),
    ]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.peerIds).toHaveLength(1);
    expect(result.rows[0]?.ref.cell).toBe('A2');
    expect(unpackEvidence(packEvidence(result))).toEqual(
      expect.objectContaining({ rows: result.rows, findings: result.findings }),
    );
  });
  it('keeps unresolved variables unevaluated with bounded evidence examples', () => {
    const result = fixture(
      'detail',
      Array.from({ length: 100 }, () => ['도장', '', '㎡', 'H*L', '10']),
    );
    expect(result.coverage[0]).toMatchObject({
      evaluated: 0,
      unevaluated: 100,
    });
    expect(result.findings).toHaveLength(20);
  });
  it('handles more than 12000 detail rows without retaining a duplicate full evidence set', () => {
    const result = fixture(
      'detail',
      Array.from({ length: 49000 }, () => ['도장', '', '㎡', '10*3', '30']),
    );
    expect(result.rowCount).toBe(49000);
    expect(result.coverage[0]?.evaluated).toBe(49000);
    expect(result.coverage[1]?.unevaluated).toBe(49000);
    expect(result.rows).toHaveLength(0);
  });
});
