import type { SourcePackageSummary } from './contracts';

export function isPendingReplacement(
  sourcePackage: SourcePackageSummary,
): boolean {
  return Boolean(
    sourcePackage.replaces?.length && !sourcePackage.replacementAppliedAt,
  );
}

export type DocumentRequirement = {
  id: string;
  label: string;
  group: 'takeoff' | 'summary';
  description: string;
  pattern: RegExp;
};

// FIN 6.2 사용자 설명서 pp. 100–106. These are availability hints,
// not a canonical parser, an exhaustive mandatory list, or review results.
const summaries: DocumentRequirement[] = [
  {
    id: 'basis',
    label: '산출근거집계표',
    group: 'summary',
    pattern: /산출근거.*집계/u,
    description:
      '재료가 어느 부위에서 어떤 산출식으로 집계됐는지 추적합니다. 산출식과 합계 대조에 유용합니다.',
  },
  {
    id: 'trade',
    label: '공종별집계표',
    group: 'summary',
    pattern: /공종별.*집계/u,
    description:
      '공종별 재료와 합계를 확인합니다. 품명·규격·단위와 재료코드 비교에 유용합니다.',
  },
  {
    id: 'building',
    label: '동별집계표',
    group: 'summary',
    pattern: /동별.*집계/u,
    description:
      '중복 아이템 검수의 기준 자료입니다. 전체 아이템을 공종 간 대조해 중복 코드와 공종 오배치 의심을 확인합니다.',
  },
  {
    id: 'floor',
    label: '층별집계표',
    group: 'summary',
    pattern: /층별.*집계/u,
    description:
      '층별 수량을 비교합니다. 환산 옵션에 따라 공종별 합계와 차이가 생길 수 있습니다.',
  },
  {
    id: 'room',
    label: '실별집계표',
    group: 'summary',
    pattern: /실별.*집계/u,
    description:
      '내부 실 단위 수량을 확인합니다. FIN에서 ‘내부 실별 집계 포함’ 옵션으로 집계해야 합니다.',
  },
  {
    id: 'household',
    label: '세대별집계표',
    group: 'summary',
    pattern: /세대별.*집계/u,
    description:
      '아파트 세대별 물량을 확인합니다. 확장형·마이너스 옵션 포함 여부를 함께 확인합니다.',
  },
  {
    id: 'part',
    label: '부위별집계표',
    group: 'summary',
    pattern: /부위별.*집계/u,
    description:
      '바닥·벽·천장 등의 부위 구분 확인용 보조 자료입니다. 실제 출력 양식의 부위 표기를 확인해야 합니다.',
  },
];

export function documentRequirements(
  discipline: 'FIN' | 'RC',
): DocumentRequirement[] {
  const names =
    discipline === 'FIN'
      ? ['내부', '외부', '공용', '계단', '창호', '가설', '철골', '토공', '조적']
      : ['보', '슬라브', '기둥', '옹벽', '기초', '아파트슬라브', '아파트옹벽'];
  return [
    ...names.map(
      (name): DocumentRequirement => ({
        id: `takeoff-${name}`,
        label: `${name}산출서`,
        group: 'takeoff',
        pattern: new RegExp(
          `${name === '슬라브' ? '(?:슬라브|슬래브)' : name}.*산출`,
          'u',
        ),
        description:
          name === '조적'
            ? '원본 보관·제외 계보용입니다. 현재 조적 AI 검수·계산에는 포함하지 않습니다.'
            : `${name} 공종이 있을 때 등록합니다. 해당 공종의 수식·수량 확인에 사용합니다.`,
      }),
    ),
    ...summaries,
  ];
}

export function matchDocument(
  filename: string,
  discipline: 'FIN' | 'RC',
): string | null {
  const normalized = filename.normalize('NFKC').replace(/[\s_-]+/gu, '');
  const catalog = documentRequirements(discipline);
  // Summaries precede takeoffs; apartment members precede generic members.
  const candidates = [
    ...catalog.filter((item) => item.group === 'summary'),
    ...catalog.filter((item) => item.group === 'takeoff').reverse(),
  ];
  return candidates.find((item) => item.pattern.test(normalized))?.id ?? null;
}

export function hasUsableStoredSources(
  sourcePackage: SourcePackageSummary,
): boolean {
  return (
    !sourcePackage.supersededBy &&
    !isPendingReplacement(sourcePackage) &&
    !['blocked', 'rejected', 'aborted'].includes(sourcePackage.status) &&
    sourcePackage.projectIdentityStatus !== 'conflict' &&
    sourcePackage.files.some((file) => file.status === 'stored')
  );
}

export function checklistAvailability(
  discipline: 'FIN' | 'RC',
  selectedFiles: Array<{ name: string }>,
  packages: SourcePackageSummary[],
) {
  const storedFiles = packages
    .filter(hasUsableStoredSources)
    .flatMap((item) => item.files.filter((file) => file.status === 'stored'));
  return documentRequirements(discipline).map((item) => ({
    ...item,
    stored: storedFiles.filter(
      (file) => matchDocument(file.filename, discipline) === item.id,
    ).length,
    selected: selectedFiles.filter(
      (file) => matchDocument(file.name, discipline) === item.id,
    ).length,
  }));
}
