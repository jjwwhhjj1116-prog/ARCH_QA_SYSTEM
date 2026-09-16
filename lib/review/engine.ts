import Decimal from 'decimal.js';
import {
  ENGINE_VERSION,
  type CanonicalRow,
  type Finding,
  type Profile,
  type RuleCoverage,
  type Run,
} from './contracts';

const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });
export class ExpressionError extends Error {}
export class ReviewLimitError extends Error {}
export function calculate(expression: string): string {
  const text = expression
    .trim()
    .replace(/^=/u, '')
    .replace(/[×xX]/gu, '*')
    .replace(/÷/gu, '/')
    .replace(/−/gu, '-')
    .replace(/\s/gu, '');
  if (!text || text.length > 500 || /[^\d.+*/()-]/u.test(text))
    throw new ExpressionError(
      '변수·참조·함수 또는 주석의 의미를 확인해야 합니다.',
    );
  const tokens = text.match(/\d+(?:\.\d*)?|\.\d+|[()+*/-]/gu) ?? [];
  if (tokens.join('') !== text || tokens.length > 200)
    throw new ExpressionError('산식 문법을 확인해야 합니다.');
  let index = 0;
  let depth = 0;
  function atom(): Decimal {
    if (++depth > 30) throw new ExpressionError('산식 중첩 한도를 넘었습니다.');
    const token = tokens[index++];
    let value: Decimal;
    if (token === '+' || token === '-') {
      value = atom();
      if (token === '-') value = value.negated();
    } else if (token === '(') {
      value = sum();
      if (tokens[index++] !== ')')
        throw new ExpressionError('괄호가 맞지 않습니다.');
    } else if (token && /^(?:\d|\.)/u.test(token)) value = new D(token);
    else throw new ExpressionError('숫자 또는 괄호가 필요합니다.');
    depth--;
    return value;
  }
  function product(): Decimal {
    let result = atom();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++];
      const next = atom();
      if (operator === '/' && next.isZero())
        throw new ExpressionError('0으로 나누는 식입니다.');
      result = operator === '*' ? result.times(next) : result.div(next);
    }
    return result;
  }
  function sum(): Decimal {
    let result = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++];
      const next = product();
      result = operator === '+' ? result.plus(next) : result.minus(next);
    }
    return result;
  }
  const result = sum();
  if (index !== tokens.length || !result.isFinite() || result.abs().gt('1e30'))
    throw new ExpressionError('산식 결과 또는 문법을 확인해야 합니다.');
  return result.toFixed();
}
export function numeric(value: string): Decimal | null {
  const text = value.trim();
  if (!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$|^[+-]?\.\d+$/u.test(text))
    return null;
  const number = new D(text.replaceAll(',', ''));
  return number.isFinite() && number.abs().lte('1e30') ? number : null;
}
const norm = (value: string) =>
  value.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
const unit = (value: string) =>
  norm(value)
    .replace('㎡', 'm2')
    .replace('㎥', 'm3')
    .replace('m²', 'm2')
    .replace('m³', 'm3');
function matchCondition(
  row: CanonicalRow,
  condition: Profile['conditions'][number],
): boolean {
  const value = norm(row.values[condition.field]);
  const target = norm(condition.value);
  return condition.operator === 'equals'
    ? value === target
    : value.includes(target);
}
export function inScope(row: CanonicalRow, profile: Profile): boolean {
  if (profile.exceptions.some((c) => matchCondition(row, c))) return false;
  return (
    !profile.conditions.length ||
    (profile.match === 'all'
      ? profile.conditions.every((c) => matchCondition(row, c))
      : profile.conditions.some((c) => matchCondition(row, c)))
  );
}
export function reviewRows(
  rows: CanonicalRow[],
  profile: Profile,
): Pick<Run, 'findings' | 'coverage' | 'limitations' | 'engineVersion'> {
  const findings: Finding[] = [];
  const coverage: RuleCoverage[] = [
    {
      ruleId: 'CALC-007',
      label: '산출식 재계산',
      evaluated: 0,
      unevaluated: 0,
      reasons: [],
    },
    {
      ruleId: 'DIM-001',
      label: '소수점 이동 의심',
      evaluated: 0,
      unevaluated: 0,
      reasons: [],
    },
    {
      ruleId: 'DIM-RANGE',
      label: '프로젝트 치수 범위',
      evaluated: 0,
      unevaluated: 0,
      reasons: [],
    },
    {
      ruleId: 'ITEM-018',
      label: '동별집계표 중복·공종 분산 후보',
      evaluated: 0,
      unevaluated: 0,
      reasons: [],
    },
  ];
  const skip = (i: number, reason: string) => {
    coverage[i]!.unevaluated++;
    if (!coverage[i]!.reasons.includes(reason))
      coverage[i]!.reasons.push(reason);
  };
  let findingBytes = 0;
  const add = (row: CanonicalRow, finding: Omit<Finding, 'id' | 'rowId'>) => {
    const result = {
      ...finding,
      id: `${finding.ruleId}:${row.id}`,
      rowId: row.id,
      evidence: [
        ...finding.evidence,
        `원본 셀: ${finding.ruleId.startsWith('DIM') ? (row.fieldRefs.dimension ?? '치수 열 미확인') : finding.ruleId === 'ITEM-018' ? [row.fieldRefs.item, row.fieldRefs.code, row.fieldRefs.trade].filter(Boolean).join(' / ') : [row.fieldRefs.formula, row.fieldRefs.quantity].filter(Boolean).join(' / ')}`,
      ],
    };
    findingBytes += new TextEncoder().encode(JSON.stringify(result)).byteLength;
    if (findingBytes > 6 * 1024 * 1024 || findings.length >= 8000)
      throw new ReviewLimitError(
        '검토 항목의 근거가 실행 한도를 넘었습니다. 자료를 나눠 검수해 주세요. 일부 항목만 정상 처리하지 않습니다.',
      );
    findings.push(result);
  };
  const eligible = rows.filter((r) => !r.excluded && inScope(r, profile));
  const cohortKey = (r: CanonicalRow) =>
    [
      r.values.cohort,
      r.values.item,
      r.values.spec,
      r.values.part,
      unit(r.values.unit),
      r.mapping.dimensionRole,
      unit(r.mapping.dimensionUnit),
    ]
      .map(norm)
      .join('|');
  const cohorts = new Map<string, CanonicalRow[]>();
  for (const row of eligible)
    if (
      row.kind === 'detail' &&
      row.mapping.cohortConfirmed &&
      row.values.cohort &&
      row.values.part &&
      row.values.unit &&
      row.mapping.dimensionRole !== 'unknown' &&
      row.mapping.dimensionUnit &&
      numeric(row.values.dimension)?.gt(0)
    ) {
      const key = cohortKey(row);
      const group = cohorts.get(key) ?? [];
      group.push(row);
      cohorts.set(key, group);
    }
  const cohortStats = new Map(
    [...cohorts].map(([key, members]) => {
      const ordered = members
        .map((row) => ({ id: row.id, value: numeric(row.values.dimension)! }))
        .sort((a, b) => a.value.cmp(b.value));
      const positions = new Map(ordered.map((v, index) => [v.id, index]));
      return [key, { members, ordered, positions }] as const;
    }),
  );
  for (const row of rows) {
    if (row.excluded) {
      for (let i = 0; i < 4; i++) skip(i, row.excluded);
      continue;
    }
    if (!inScope(row, profile)) {
      for (let i = 0; i < 4; i++) skip(i, '지침 대상·예외 조건에서 제외');
      continue;
    }
    const values = row.values;
    if (!profile.arithmetic) skip(0, '지침 사용 중지');
    else if (
      row.kind !== 'detail' ||
      row.mapping.arithmeticBasis !== 'formula-result' ||
      !values.unit ||
      !values.formula ||
      !numeric(values.quantity)
    )
      skip(0, '상세 산식·숫자 물량·단위·환산 전후 기준 확인 필요');
    else {
      try {
        const result = new D(calculate(values.formula));
        const original = numeric(values.quantity)!;
        coverage[0]!.evaluated++;
        if (result.minus(original).abs().gt(profile.tolerance))
          add(row, {
            ruleId: 'CALC-007',
            level: 'A',
            severity: 'important',
            confidence: 'reproducible',
            title: '산출식과 기재 물량 불일치',
            evidence: [
              `원식: ${values.formula}`,
              `재계산 ${result.toFixed()} / 기재 ${original.toFixed()} ${values.unit}`,
              `차이 ${result.minus(original).toFixed()} · 허용오차 ${profile.tolerance}`,
            ],
            peerIds: [],
            limitation:
              '확인된 직접 산식 결과 기준입니다. 도면 치수·별도 집계 환산은 대조하지 않았습니다.',
          });
      } catch (error) {
        if (error instanceof ReviewLimitError) throw error;
        const reason =
          error instanceof ExpressionError ? error.message : '산식 해석 실패';
        skip(0, reason);
        add(row, {
          ruleId: 'PARSE-008',
          level: 'A',
          severity: 'check',
          confidence: 'reproducible',
          title: '검수 불가 · 산식 해석 필요',
          evidence: [`원식: ${values.formula}`, reason],
          peerIds: [],
          limitation: '해석하지 못한 식을 정상 또는 0으로 처리하지 않았습니다.',
        });
      }
    }
    const dimension = numeric(values.dimension);
    const stats = cohortStats.get(cohortKey(row));
    const peerCount = stats ? stats.members.length - 1 : 0;
    if (!profile.decimalShift) skip(1, '지침 사용 중지');
    else if (
      row.kind !== 'detail' ||
      !stats?.positions.has(row.id) ||
      !row.mapping.cohortConfirmed ||
      row.mapping.dimensionRole === 'unknown' ||
      !dimension?.gt(0) ||
      peerCount < profile.minPeers ||
      !inScope(row, profile)
    )
      skip(1, '치수 의미·동일 비교집단 확인 또는 충분한 다른 표본 필요');
    else {
      coverage[1]!.evaluated++;
      const removed = stats!.positions.get(row.id)!;
      const at = (index: number) =>
        stats!.ordered[index >= removed ? index + 1 : index]!.value;
      const middle = Math.floor(peerCount / 2);
      const baseline =
        peerCount % 2
          ? at(middle)
          : at(middle - 1)
              .plus(at(middle))
              .div(2);
      if (baseline.gt(0) && dimension.gt(0)) {
        const close = (n: Decimal) =>
          n.minus(baseline).abs().div(baseline).lte(profile.peerTolerance);
        if (!close(dimension))
          for (const scale of [0.01, 0.1, 10, 100]) {
            const candidate = dimension.times(scale);
            if (close(candidate)) {
              add(row, {
                ruleId: 'DIM-001',
                level: 'B',
                severity: 'important',
                confidence: 'pattern',
                title: '치수 소수점 입력 오류 의심',
                evidence: [
                  `확인 치수 ${dimension.toFixed()} ${row.mapping.dimensionUnit}`,
                  `다른 ${peerCount}개 표본 중앙값 ${baseline.toFixed()} · 허용 편차 ${profile.peerTolerance * 100}%`,
                  `치수를 ${scale}배 하면 비교 범위에 들어옵니다.`,
                ],
                peerIds: stats!.members
                  .filter((p) => p.id !== row.id)
                  .slice(0, 50)
                  .map((p) => p.id),
                candidate: candidate.toFixed(),
                limitation:
                  '동일 비교집단 전체로 중앙값을 계산했습니다. 비교 원본 목록은 최대 50개만 표시하며 전체 행은 실행 스냅샷에 보존됩니다. 도면 미대조·자동 수정 없음.',
              });
              break;
            }
          }
      }
    }
    if (!profile.rangeEnabled) skip(2, '프로젝트 치수 기준 미설정');
    else if (
      !dimension ||
      row.mapping.dimensionRole !== profile.dimensionRole ||
      unit(row.mapping.dimensionUnit) !== unit(profile.dimensionUnit) ||
      !inScope(row, profile)
    )
      skip(2, '치수 역할·단위·적용 조건 불일치 또는 값 없음');
    else {
      coverage[2]!.evaluated++;
      if (dimension.lt(profile.rangeMin) || dimension.gt(profile.rangeMax))
        add(row, {
          ruleId: 'DIM-RANGE',
          level: 'B',
          severity: 'check',
          confidence: 'candidate',
          title: '프로젝트 치수 기준 범위 이탈',
          evidence: [
            `관측 ${dimension.toFixed()} ${profile.dimensionUnit}`,
            `프로젝트 기준 ${profile.rangeMin} ~ ${profile.rangeMax} ${profile.dimensionUnit}`,
            `모두/하나라도 조건 ${profile.match} · 예외 ${profile.exceptions.length}개`,
          ],
          peerIds: [],
          limitation:
            '프로젝트에서 설정한 기준입니다. 실제 오류 여부는 사람이 확인합니다.',
        });
    }
    if (!profile.duplicates) skip(3, '지침 사용 중지');
    else if (
      row.kind !== 'building-summary' ||
      !values.item ||
      !values.spec ||
      !values.unit ||
      !values.code ||
      !values.trade
    )
      skip(3, '동별집계표 품명·규격·단위·재료코드·공종 확인 필요');
    else coverage[3]!.evaluated++;
  }
  if (profile.duplicates) {
    const groups = new Map<string, CanonicalRow[]>();
    for (const row of eligible.filter(
      (r) =>
        r.kind === 'building-summary' &&
        r.values.spec &&
        r.values.unit &&
        r.values.code &&
        r.values.trade,
    )) {
      const key = [
        row.values.item,
        row.values.spec,
        unit(row.values.unit),
        row.values.part,
      ]
        .map(norm)
        .join('|');
      const members = groups.get(key) ?? [];
      members.push(row);
      groups.set(key, members);
    }
    for (const group of groups.values()) {
      const codes = new Set(group.map((r) => norm(r.values.code)));
      if (codes.size < 2) continue;
      const trades = [...new Set(group.map((r) => r.values.trade))];
      const first = group[0]!;
      add(first, {
        ruleId: 'ITEM-018',
        level: 'C',
        severity: 'check',
        confidence: 'candidate',
        title:
          trades.length > 1
            ? '동일 아이템의 공종 분산·중복 후보'
            : '서로 다른 코드의 중복 아이템 후보',
        evidence: [
          `품명 ${first.values.item} · 규격 ${first.values.spec} · 단위 ${first.values.unit}`,
          `재료코드 ${[...codes].join(', ')}`,
          `등록 공종 ${trades.join(' / ')}`,
        ],
        peerIds: group.slice(1).map((r) => r.id),
        limitation:
          '같은 표기만 비교한 후보입니다. 시공 부위·바탕/최종마감·예외를 확인하세요. 적정 공종 자동 확정·병합·합산 없음.',
      });
    }
  }
  return {
    engineVersion: ENGINE_VERSION,
    findings,
    coverage,
    limitations: [
      '도면 치수·프로젝트 독립 기준·변수/산식코드·환산·개소 조합을 자동 대조하지 않았습니다.',
      '미평가 항목은 정상 판정이 아닙니다. 일반 숫자 산식만 안전하게 재계산하며 실행 코드를 평가하지 않습니다.',
      '중복 검사는 동별집계표의 동일 표기 후보입니다. 다른 언어·유사어 및 적정 공종의 AI 의미 판단은 아직 수행하지 않습니다.',
      '기본 허용오차·비교 표본 기준은 제품 초깃값이며 업계 공통 기준이 아닙니다. 프로젝트 담당자 승인이 필요합니다.',
    ],
  };
}
