import type {
  CanonicalRow,
  Finding,
  Mapping,
  RuleCoverage,
  Run,
  Sheet,
  SourceRef,
} from './contracts';
import { defaultProfile } from './contracts';
import {
  calculate,
  ExpressionError,
  numeric,
  ReviewLimitError,
} from './engine';
import { iterateCanonicalRows, suggestMapping } from './workbook';

export const BASELINE_VERSION = 'fin-product-baseline-1.0.0';
export const baselineProfile = {
  ...defaultProfile,
  name: '제품 기본검사',
  reason: '제품 기본검사 · 프로젝트 승인 지침 및 도면 검증 아님',
  decimalShift: false,
  arithmetic: false,
  rangeEnabled: false,
};
export type BaselinePart = {
  mappings: Mapping[];
  rows: CanonicalRow[];
  catalog: CanonicalRow[];
  findings: Finding[];
  coverage: RuleCoverage[];
  limitations: string[];
  rowCount: number;
  sources: SourceRef[];
};
const normalize = (value: string) =>
  value.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
const normalizeUnit = (value: string) =>
  normalize(value)
    .replace('㎡', 'm2')
    .replace('㎥', 'm3')
    .replace('m²', 'm2')
    .replace('m³', 'm3');

// Read each canonical row once. Retain evidence rows, not a second full workbook.
export function baselineSource(
  sheets: Sheet[],
  source: Omit<SourceRef, 'sheet' | 'row' | 'cell'>,
  saved: Mapping[],
): BaselinePart {
  const result: BaselinePart = {
    mappings: [],
    rows: [],
    catalog: [],
    findings: [],
    coverage: [
      {
        ruleId: 'BASIC-SYNTAX',
        label: '산식 구문·계산 가능성',
        evaluated: 0,
        unevaluated: 0,
        reasons: [],
      },
      {
        ruleId: 'BASIC-QUANTITY',
        label: '수량 의미 확인',
        evaluated: 0,
        unevaluated: 0,
        reasons: [
          '개소·환산·반올림 기준이 확정되기 전에는 계산값과 기재 물량을 오류로 판정하지 않습니다.',
        ],
      },
      {
        ruleId: 'ITEM-018',
        label: '동별집계표 중복·공종 분산 후보',
        evaluated: 0,
        unevaluated: 0,
        reasons: [],
      },
    ],
    limitations: [],
    rowCount: 0,
    sources: [],
  };
  const syntax = result.coverage[0]!;
  const quantity = result.coverage[1]!;
  const catalogCoverage = result.coverage[2]!;
  let unresolvedExamples = 0;
  for (const sheet of sheets) {
    const mapping =
      saved.find(
        (m) =>
          m.sourceVersionId === source.sourceVersionId &&
          m.sheet === sheet.name,
      ) ?? suggestMapping(sheet, source.sourceVersionId, source.filename);
    result.mappings.push(mapping);
    result.sources.push({
      ...source,
      sheet: sheet.name,
      row: mapping.headerRow,
      cell: `A${mapping.headerRow}`,
    });
    if (!mapping.confirmed) {
      result.limitations.push(
        `${source.filename}/${sheet.name}: 머리글·자료 종류 미확인 — 이 시트는 미평가입니다.`,
      );
      syntax.unevaluated += sheet.rows.length;
      continue;
    }
    if (mapping.kind === 'reference') {
      result.limitations.push(
        `${source.filename}/${sheet.name}: 참고자료 — 상세식/아이템 검사가 아닌 후속 교차검수 자료입니다.`,
      );
      continue;
    }
    for (const row of iterateCanonicalRows(sheet, mapping, source)) {
      result.rowCount++;
      if (row.excluded) {
        syntax.unevaluated++;
        continue;
      }
      if (row.kind === 'building-summary') {
        if (row.values.item.trim() && row.values.unit.trim()) {
          row.ref.cell = row.fieldRefs.item ?? row.ref.cell;
          result.catalog.push(row);
          if (row.values.code.trim() && row.values.trade.trim())
            catalogCoverage.evaluated++;
          else {
            catalogCoverage.unevaluated++;
            const reason =
              '재료코드 또는 공종이 없는 행은 중복·공종 분산 여부를 완전히 확인하지 못했습니다. 가능한 표기 비교만 후보로 표시합니다.';
            if (!catalogCoverage.reasons.includes(reason))
              catalogCoverage.reasons.push(reason);
          }
          if (result.catalog.length > 20_000)
            throw new ReviewLimitError(
              '동별집계표 아이템이 파일당 20,000행을 넘었습니다. 이 파일은 미완료로 표시합니다.',
            );
        } else {
          catalogCoverage.unevaluated++;
          const reason = '품명 또는 단위가 없는 행은 비교하지 않았습니다.';
          if (!catalogCoverage.reasons.includes(reason))
            catalogCoverage.reasons.push(reason);
        }
        continue;
      }
      if (!row.values.formula.trim()) {
        syntax.unevaluated++;
        continue;
      }
      try {
        const calculated = calculate(row.values.formula);
        syntax.evaluated++;
        const supplied = numeric(row.values.quantity);
        if (mapping.arithmeticBasis === 'formula-result' && supplied) {
          quantity.evaluated++;
          // No arbitrary tolerance: an exact difference is only a comparison candidate.
          if (!supplied.equals(calculated))
            add(
              {
                ruleId: 'BASIC-QUANTITY',
                title: '계산값과 기재 물량 대조 필요',
                level: 'C',
                confidence: 'candidate',
                evidence: [
                  `원 산식: ${row.values.formula}`,
                  `재계산: ${calculated}`,
                  `기재 물량: ${row.values.quantity} ${row.values.unit}`,
                ],
                limitation:
                  '반올림·개소·환산 적용을 먼저 확인하세요. 확정 오류나 수정값이 아닙니다.',
              },
              row,
            );
        } else quantity.unevaluated++;
      } catch (error) {
        if (!(error instanceof ExpressionError)) throw error;
        syntax.unevaluated++;
        quantity.unevaluated++;
        const pureArithmetic = /^[\d\s.+*/()=×xX÷−-]+$/u.test(
          row.values.formula,
        );
        if (pureArithmetic || unresolvedExamples++ < 20)
          add(
            {
              ruleId: 'BASIC-SYNTAX',
              title: pureArithmetic
                ? '산식 문법·연산 확인 필요'
                : '변수·참조 해석 필요 (미평가 예시)',
              level: 'A',
              confidence: 'reproducible',
              evidence: [`원 산식: ${row.values.formula}`, error.message],
              limitation:
                '현재 파서가 이 식을 계산하지 못했습니다. FIN 원본 오류로 확정한 것이 아닙니다.',
            },
            row,
          );
      }
    }
  }
  if (syntax.unevaluated)
    syntax.reasons.push(
      '빈 산식·숨김·소계·변수·참조·범위 제외를 정상으로 계산하지 않습니다. 해석 불가 예시는 파일당 최대 20건 표시합니다.',
    );
  return result;
  function add(
    input: Pick<
      Finding,
      'ruleId' | 'title' | 'level' | 'confidence' | 'evidence' | 'limitation'
    >,
    row: CanonicalRow,
  ) {
    if (result.findings.length >= 2000)
      throw new ReviewLimitError(
        '파일당 검토 항목 2,000건 한도를 넘었습니다. 이 파일은 미완료로 남기며 정상으로 처리하지 않습니다.',
      );
    result.findings.push({
      ...input,
      id: `${input.ruleId}:${row.id}`,
      rowId: row.id,
      severity: 'check',
      peerIds: [],
    });
    result.rows.push(row);
  }
}

export function combineBaseline(
  parts: BaselinePart[],
): Omit<BaselinePart, 'catalog'> {
  const result: Omit<BaselinePart, 'catalog'> = {
    rows: [],
    findings: [],
    coverage: [],
    limitations: [],
    mappings: [],
    sources: [],
    rowCount: 0,
  };
  const groups = new Map<string, CanonicalRow[]>();
  const kept = new Map<string, CanonicalRow>();
  for (const part of parts) {
    result.rowCount += part.rowCount;
    result.mappings.push(...part.mappings);
    result.sources.push(...part.sources);
    result.findings.push(...part.findings);
    result.limitations.push(...part.limitations);
    part.rows.forEach((row) => kept.set(row.id, row));
    for (const coverage of part.coverage) {
      const prior = result.coverage.find((c) => c.ruleId === coverage.ruleId);
      if (prior) {
        prior.evaluated += coverage.evaluated;
        prior.unevaluated += coverage.unevaluated;
        prior.reasons = [...new Set([...prior.reasons, ...coverage.reasons])];
      } else
        result.coverage.push({ ...coverage, reasons: [...coverage.reasons] });
    }
    for (const row of part.catalog) {
      // Deliberately omit trade: the same item may be scattered across trades.
      const key = [
        normalize(row.values.item),
        normalize(row.values.spec),
        normalizeUnit(row.values.unit),
        normalize(row.values.part),
      ].join('\u001f');
      const peers = groups.get(key) ?? [];
      peers.push(row);
      groups.set(key, peers);
    }
  }
  for (const peers of groups.values()) {
    const distinct = new Set(
      peers.map((r) =>
        [normalize(r.values.code), normalize(r.values.trade)].join('|'),
      ),
    );
    if (peers.length < 2 || distinct.size < 2) continue;
    const row = peers[0]!;
    const representative = [
      ...new Map(
        peers.map((r) => [`${r.values.code}|${r.values.trade}`, r]),
      ).values(),
    ].slice(0, 50);
    representative.forEach((r) => kept.set(r.id, r));
    kept.set(row.id, row);
    result.findings.push({
      id: `ITEM-018:${row.id}`,
      ruleId: 'ITEM-018',
      level: 'C',
      confidence: 'candidate',
      severity: 'check',
      title:
        new Set(peers.map((r) => r.values.trade)).size > 1
          ? '같은 표기 아이템이 여러 공종에 분산됨'
          : '같은 표기 아이템에 서로 다른 재료코드',
      rowId: row.id,
      peerIds: representative.filter((r) => r.id !== row.id).map((r) => r.id),
      evidence: [
        `동별집계표의 품명·규격·단위·부위 표기 일치: ${peers.length}행`,
        ...representative.map(
          (r) =>
            `${r.values.code || '코드 없음'} · ${r.values.trade || '공종 미확인'} · ${r.ref.filename}/${r.ref.sheet}/${r.ref.row}행`,
        ),
      ],
      limitation: `표기 일치 후보이며 의미가 같은 재료인지 사람이 확인해야 합니다. ${row.values.part ? '' : '부위 미확인. '}자동 병합·합산·공종 이동은 하지 않습니다.${representative.length < distinct.size ? ' 근거 목록은 코드·공종별 대표 50개입니다.' : ''}`,
    });
  }
  if (result.findings.length > 8000)
    throw new ReviewLimitError(
      '전체 검토 후보가 8,000건을 넘었습니다. 실행을 미완료로 표시합니다.',
    );
  result.rows = [...kept.values()];
  result.limitations.push(
    '제품 기본검사입니다. 소수점·층고·두께의 실제 입력 정확성과 도면 대조는 수행하지 않았습니다. 회사·현장 지침 승인을 대신하지 않습니다.',
    '외부 AI를 호출하지 않았습니다. LLM 토큰 사용량 0. 표현이 다른 동의어·베트남어 품명은 자동으로 동일 재료로 합치지 않습니다.',
  );
  return result;
}

type PackedRow = [
  number,
  number,
  number,
  string,
  CanonicalRow['values'],
  string[],
  string | null,
  CanonicalRow['fieldRefs'],
];
export function packEvidence<
  T extends { rows: CanonicalRow[]; catalog?: CanonicalRow[] },
>(data: T) {
  const mappings: Mapping[] = [];
  const sources: Omit<SourceRef, 'row' | 'cell'>[] = [];
  const mappingIds = new Map<string, number>();
  const sourceIds = new Map<string, number>();
  function pack(row: CanonicalRow): PackedRow {
    const mk = JSON.stringify(row.mapping);
    if (!mappingIds.has(mk)) {
      mappingIds.set(mk, mappings.length);
      mappings.push(row.mapping);
    }
    const { row: _row, cell: _cell, ...source } = row.ref;
    const sk = JSON.stringify(source);
    if (!sourceIds.has(sk)) {
      sourceIds.set(sk, sources.length);
      sources.push(source);
    }
    return [
      mappingIds.get(mk)!,
      sourceIds.get(sk)!,
      row.ref.row,
      row.ref.cell,
      row.values,
      row.original,
      row.excluded,
      row.fieldRefs,
    ];
  }
  return {
    ...data,
    rows: data.rows.map(pack),
    ...(data.catalog ? { catalog: data.catalog.map(pack) } : {}),
    packedEvidence: { version: 1, mappings, sources },
  };
}
export function unpackEvidence<T extends Run | BaselinePart>(data: unknown): T {
  const record = data as {
    rows: PackedRow[];
    catalog?: PackedRow[];
    packedEvidence?: {
      version: number;
      mappings: Mapping[];
      sources: Omit<SourceRef, 'row' | 'cell'>[];
    };
  };
  if (!record.packedEvidence) return data as T;
  if (record.packedEvidence.version !== 1)
    throw new Error('지원하지 않는 검수 근거 형식입니다.');
  const { mappings, sources } = record.packedEvidence;
  const unpack = ([
    mappingId,
    sourceId,
    row,
    cell,
    values,
    original,
    excluded,
    fieldRefs,
  ]: PackedRow): CanonicalRow => {
    const mapping = mappings[mappingId]!;
    const ref = { ...sources[sourceId]!, row, cell };
    return {
      id: `${ref.sourceVersionId}:${ref.sheet}:${row}`,
      ref,
      mapping,
      kind: mapping.kind,
      values,
      original,
      excluded,
      fieldRefs,
    };
  };
  return {
    ...record,
    rows: record.rows.map(unpack),
    ...(record.catalog ? { catalog: record.catalog.map(unpack) } : {}),
  } as unknown as T;
}
