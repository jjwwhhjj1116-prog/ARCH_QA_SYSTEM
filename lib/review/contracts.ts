import { z } from 'zod';

export const ENGINE_VERSION = 'fin-evidence-1.0.0';
export const fields = [
  'item',
  'spec',
  'unit',
  'formula',
  'quantity',
  'trade',
  'part',
  'code',
  'scope',
  'dimension',
  'cohort',
] as const;
export type Field = (typeof fields)[number];
export const fieldLabels: Record<Field, string> = {
  item: '품명',
  spec: '규격',
  unit: '단위',
  formula: '산출식',
  quantity: '물량',
  trade: '공종',
  part: '부위',
  code: '재료코드',
  scope: '동·층·실 범위',
  dimension: '확인할 치수',
  cohort: '동일 비교집단',
};
const column = z.number().int().min(0).max(255).nullable();
export const mappingSchema = z
  .object({
    sourceVersionId: z.uuid(),
    sheet: z.string().min(1).max(120),
    headerRow: z.number().int().min(1).max(1000),
    kind: z.enum(['detail', 'building-summary', 'reference']),
    columns: z.object(
      Object.fromEntries(fields.map((f) => [f, column])) as Record<
        Field,
        typeof column
      >,
    ),
    confirmed: z.boolean(),
    recognition: z
      .object({
        layout: z.string().max(60),
        version: z.literal(1),
      })
      .optional(),
    arithmeticBasis: z.enum(['unknown', 'formula-result']),
    dimensionRole: z.enum([
      'unknown',
      'length',
      'height',
      'thickness',
      'count',
    ]),
    dimensionUnit: z.string().max(20),
    cohortConfirmed: z.boolean(),
  })
  .refine(
    (m) => {
      const selected = Object.values(m.columns).filter((c) => c !== null);
      return !m.confirmed || new Set(selected).size === selected.length;
    },
    {
      message:
        '확인된 매핑에서 서로 다른 의미의 필드를 같은 열로 연결할 수 없습니다.',
    },
  );
export type Mapping = z.infer<typeof mappingSchema>;
const conditionSchema = z.object({
  field: z.enum(fields),
  operator: z.enum(['equals', 'contains']),
  value: z.string().min(1).max(120),
});
export const profileSchema = z
  .object({
    name: z.string().min(1).max(100),
    reason: z.string().min(1).max(500),
    arithmetic: z.boolean(),
    tolerance: z.number().min(0).max(100),
    decimalShift: z.boolean(),
    minPeers: z.number().int().min(5).max(100),
    peerTolerance: z.number().min(0.01).max(0.5),
    duplicates: z.boolean(),
    rangeEnabled: z.boolean(),
    rangeMin: z.number(),
    rangeMax: z.number(),
    dimensionRole: z.enum(['length', 'height', 'thickness', 'count']),
    dimensionUnit: z.string().min(1).max(20),
    match: z.enum(['all', 'any']),
    conditions: z.array(conditionSchema).max(8),
    exceptions: z.array(conditionSchema).max(8),
  })
  .refine((p) => p.rangeMin <= p.rangeMax, {
    message: '최솟값은 최댓값 이하여야 합니다.',
  });
export type Profile = z.infer<typeof profileSchema>;
export const defaultProfile: Profile = {
  name: 'FIN 기본 검토 지침',
  reason: '초기 검토용 지침 · 프로젝트 담당자가 기준 확인 필요',
  arithmetic: true,
  tolerance: 0.01,
  decimalShift: true,
  minPeers: 5,
  peerTolerance: 0.15,
  duplicates: true,
  rangeEnabled: false,
  rangeMin: 0,
  rangeMax: 0,
  dimensionRole: 'height',
  dimensionUnit: 'm',
  match: 'all',
  conditions: [],
  exceptions: [],
};
export type Sheet = {
  name: string;
  rows: { number: number; cells: string[]; hidden: boolean }[];
};
export type SourceRef = {
  sourceVersionId: string;
  filename: string;
  sha256: string;
  sheet: string;
  row: number;
  cell: string;
};
export type CanonicalRow = {
  id: string;
  ref: SourceRef;
  values: Record<Field, string>;
  original: string[];
  kind: Mapping['kind'];
  mapping: Mapping;
  excluded: string | null;
  fieldRefs: Partial<Record<Field, string>>;
};
export type Finding = {
  id: string;
  ruleId: string;
  level: 'A' | 'B' | 'C';
  severity: 'important' | 'check';
  confidence: 'reproducible' | 'pattern' | 'candidate';
  title: string;
  rowId: string;
  evidence: string[];
  peerIds: string[];
  limitation: string;
  candidate?: string;
};
export type RuleCoverage = {
  ruleId: string;
  label: string;
  evaluated: number;
  unevaluated: number;
  reasons: string[];
};
export type Run = {
  id: string;
  projectId: string;
  caseId: string;
  createdAt: string;
  actorId: string;
  profileId: string;
  profileVersion: number;
  trial: boolean;
  engineVersion: string;
  profile: Profile;
  mappings: Mapping[];
  rows: CanonicalRow[];
  findings: Finding[];
  coverage: RuleCoverage[];
  limitations: string[];
  sources: SourceRef[];
};
export type ProfileVersion = {
  id: string;
  version: number;
  status: 'draft' | 'active';
  profile: Profile;
  createdAt: string;
  trialRunId: string | null;
};
export type RunSummary = Pick<
  Run,
  'id' | 'createdAt' | 'profileVersion' | 'trial'
> & { findingCount: number; rowCount: number };
export type Decision = {
  id: string;
  findingId: string;
  disposition: 'needs_fix' | 'normal' | 'hold';
  reason: string;
  actorId: string;
  createdAt: string;
};
export type ReviewSource = {
  sourceVersionId: string;
  sourceFileId: string;
  filename: string;
  format: 'xlsx' | 'csv';
  packageId: string;
};
export type ReviewState = {
  mappingVersionId: string | null;
  sources: ReviewSource[];
  profiles: ProfileVersion[];
  runs: RunSummary[];
  mappings: Mapping[];
};
export type Inspection = {
  source: ReviewSource;
  sha256: string;
  sheets: {
    name: string;
    rowCount: number;
    preview: Sheet['rows'];
    suggested: Mapping;
  }[];
};

export const deferredRules = [
  [
    'DIM-002',
    '층고·높이 기준 대조',
    '층·공간별 층고 및 복층·아트리움 예외 연결',
  ],
  [
    'DIM-004',
    '규격 두께·단위 환산 대조',
    '규격의 두께와 산식 항의 의미·단위 확인',
  ],
  ['QTY-006', '개소·반복 계수 중복', '상세와 집계 각 단계의 개소 적용 근거'],
  ['QTY-010', '공제량·음수·0 물량', '정상 감산·변경분과 공제 적용 범위'],
  ['QTY-013', '할증·환산 적용', '할증 전후·환산계수와 적용 단계'],
  [
    'SUM-014',
    '상세·집계 대조 및 반영 누락',
    '동일 개정본·공사·단위와 집계 조합 연결',
  ],
  ['WIN-016', '창호·공제 대조', '창호 리스트와 산출행의 명시적 연결'],
  ['FLR-017', '반복층 편차', '층 구성·동일 타입·특수층 및 변경 기준'],
  ['AREA-019', '마감 면적 정합성', '바탕층/최종마감 구분 및 독립 기준면적'],
  ['REV-020', '개정 전후 수량 대조', '행 번호와 무관한 승인된 항목 연결 기준'],
] as const;
