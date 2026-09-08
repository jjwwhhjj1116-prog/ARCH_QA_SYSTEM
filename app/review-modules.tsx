'use client';
import { UiText, useUiText } from './ui-translation';

import {
  BarChart3,
  Building2,
  Download,
  FileScan,
  FileSpreadsheet,
  FolderKanban,
  Layers3,
  LockKeyhole,
  Ruler,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PersonalAiSettings } from './personal-ai-settings';
import { useState } from 'react';
import type { ProjectSummary, ReviewCaseSummary } from '@/lib/domain/contracts';

export type StructureAnalysisView =
  | 'analysis-structure-beam'
  | 'analysis-structure-slab'
  | 'analysis-structure-column'
  | 'analysis-structure-retaining-wall'
  | 'analysis-structure-foundation'
  | 'analysis-structure-apartment-retaining-wall'
  | 'analysis-structure-apartment-slab';

export type FinishAnalysisView =
  | 'analysis-finish-window'
  | 'analysis-finish-interior'
  | 'analysis-finish-exterior'
  | 'analysis-finish-masonry';

export type TradeAnalysisView = StructureAnalysisView | FinishAnalysisView;

export type StudioView =
  | 'project-register'
  | 'project-data'
  | 'formula-ai'
  | 'duplicate-ai'
  | 'analysis'
  | TradeAnalysisView
  | 'settings';

export type StageTone =
  | 'cyan'
  | 'blue'
  | 'amber'
  | 'violet'
  | 'emerald'
  | 'slate';

export type StageNumber = 1 | 2 | 3 | 4 | 5;

export type StudioNavigationLeaf = {
  kind: 'item';
  id: StudioView;
  label: string;
  icon: LucideIcon;
  stage: StageNumber | null;
  tone: StageTone;
};

export type StudioNavigationGroup = {
  kind: 'group';
  id: 'analysis-group' | 'structure-group' | 'finish-group';
  label: string;
  icon: LucideIcon;
  stage: StageNumber;
  tone: StageTone;
  defaultView?: StudioView;
  children: readonly StudioNavigationNode[];
};

export type StudioNavigationNode = StudioNavigationLeaf | StudioNavigationGroup;

function navigationLeaf(
  id: TradeAnalysisView,
  label: string,
): StudioNavigationLeaf {
  return {
    kind: 'item',
    id,
    label,
    icon: Building2,
    stage: 5,
    tone: 'emerald',
  };
}

export const studioNavigation = [
  {
    kind: 'item',
    id: 'project-register',
    label: '프로젝트 등록',
    icon: FolderKanban,
    stage: 1,
    tone: 'cyan',
  },
  {
    kind: 'item',
    id: 'project-data',
    label: '프로젝트 자료',
    icon: FileSpreadsheet,
    stage: 2,
    tone: 'blue',
  },
  {
    kind: 'item',
    id: 'formula-ai',
    label: '산출식 AI 검수',
    icon: FileScan,
    stage: 3,
    tone: 'amber',
  },
  {
    kind: 'item',
    id: 'duplicate-ai',
    label: '중복 아이템 AI 검수',
    icon: Layers3,
    stage: 4,
    tone: 'violet',
  },
  {
    kind: 'group',
    id: 'analysis-group',
    label: '수량산출 분석표',
    icon: BarChart3,
    stage: 5,
    tone: 'emerald',
    defaultView: 'analysis',
    children: [
      {
        kind: 'item',
        id: 'analysis',
        label: '분석표 개요',
        icon: Ruler,
        stage: 5,
        tone: 'emerald',
      },
      {
        kind: 'group',
        id: 'structure-group',
        label: '구조',
        icon: Building2,
        stage: 5,
        tone: 'emerald',
        children: [
          navigationLeaf('analysis-structure-beam', '보'),
          navigationLeaf('analysis-structure-slab', '슬라브'),
          navigationLeaf('analysis-structure-column', '기둥'),
          navigationLeaf('analysis-structure-retaining-wall', '옹벽'),
          navigationLeaf('analysis-structure-foundation', '기초'),
          navigationLeaf('analysis-structure-apartment-slab', '아파트슬라브'),
          navigationLeaf(
            'analysis-structure-apartment-retaining-wall',
            '아파트옹벽',
          ),
        ],
      },
      {
        kind: 'group',
        id: 'finish-group',
        label: '마감',
        icon: FileSpreadsheet,
        stage: 5,
        tone: 'emerald',
        children: [
          navigationLeaf('analysis-finish-interior', '면적 분석표(내부)'),
          navigationLeaf('analysis-finish-exterior', '면적 분석표(외부)'),
          navigationLeaf('analysis-finish-masonry', '수량 분석표(조적)'),
          navigationLeaf('analysis-finish-window', '수량 분석표(창호)'),
        ],
      },
    ],
  },
  {
    kind: 'item',
    id: 'settings',
    label: '설정',
    icon: Settings,
    stage: null,
    tone: 'slate',
  },
] as const satisfies readonly StudioNavigationNode[];

type ModuleView = Exclude<StudioView, 'project-register' | 'project-data'>;

type ModuleWorkspaceProps = {
  isAdmin?: boolean;
  view: ModuleView;
  selectedProject: ProjectSummary | null;
  reviewCases: ReviewCaseSummary[];
  onOpenProjects: () => void;
};

type TradeMetadata = {
  team: '구조' | '마감';
  code: 'RC' | 'FIN';
  trade: string;
};

const tradeMetadata: Record<TradeAnalysisView, TradeMetadata> = {
  'analysis-structure-beam': { team: '구조', code: 'RC', trade: '보' },
  'analysis-structure-slab': { team: '구조', code: 'RC', trade: '슬라브' },
  'analysis-structure-column': { team: '구조', code: 'RC', trade: '기둥' },
  'analysis-structure-retaining-wall': {
    team: '구조',
    code: 'RC',
    trade: '옹벽',
  },
  'analysis-structure-foundation': {
    team: '구조',
    code: 'RC',
    trade: '기초',
  },
  'analysis-structure-apartment-retaining-wall': {
    team: '구조',
    code: 'RC',
    trade: '아파트옹벽',
  },
  'analysis-structure-apartment-slab': {
    team: '구조',
    code: 'RC',
    trade: '아파트슬라브',
  },
  'analysis-finish-interior': { team: '마감', code: 'FIN', trade: '내부' },
  'analysis-finish-exterior': { team: '마감', code: 'FIN', trade: '외부' },
  'analysis-finish-masonry': { team: '마감', code: 'FIN', trade: '조적' },
  'analysis-finish-window': { team: '마감', code: 'FIN', trade: '창호' },
};

export function ModuleWorkspace({
  isAdmin = false,
  view,
  selectedProject,
  onOpenProjects,
}: ModuleWorkspaceProps) {
  if (view === 'settings') return <SettingsWorkspace isAdmin={isAdmin} />;

  if (!selectedProject) {
    return (
      <section
        className="module-empty-state"
        aria-labelledby="module-empty-title"
      >
        <LockKeyhole aria-hidden="true" />
        <div>
          <h1 id="module-empty-title">
            <UiText text="검수 프로젝트를 먼저 선택하세요" />
          </h1>
          <p>
            {' '}
            <UiText text="프로젝트 경계를 확정하고 산출서와 집계표를 등록해야 다음 단계의 결과가 다른 현장과 섞이지 않습니다." />{' '}
          </p>
        </div>
        <button
          className="primary-action"
          type="button"
          onClick={onOpenProjects}
        >
          {' '}
          <UiText text="프로젝트 등록·선택으로 이동" />{' '}
        </button>
      </section>
    );
  }

  if (view === 'formula-ai')
    return <FormulaWorkspace project={selectedProject} />;
  if (view === 'duplicate-ai')
    return <DuplicateWorkspace project={selectedProject} />;
  if (view === 'analysis')
    return <AnalysisOverviewWorkspace project={selectedProject} />;

  return (
    <TradeAnalysisWorkspace
      project={selectedProject}
      metadata={tradeMetadata[view]}
    />
  );
}

function ModuleHeading({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status: string;
}) {
  return (
    <header className="module-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <span className="erp-status-badge">{status}</span>
    </header>
  );
}

function FormulaWorkspace({ project }: { project: ProjectSummary }) {
  const uiText = useUiText();
  const [teamFilter, setTeamFilter] = useState<'all' | 'RC' | 'FIN'>('all');
  const showExample = teamFilter !== 'RC';

  return (
    <div className="analytics-workspace">
      <h1 className="sr-only">
        <UiText text="산출식 AI 검수" />
      </h1>
      <header className="review-module-context">
        <div>
          <span>
            <UiText text="현재 프로젝트" />
          </span>
          <strong>{project.name}</strong>
          <p>
            <UiText text="부위·단위·건물 규모를 기준으로 과대 산출식을 확인합니다." />
          </p>
        </div>
        <span className="status-badge status-ready">
          {' '}
          <UiText text="Level A 결정론 우선 · AI는 설명만" />{' '}
        </span>
      </header>
      <div className="module-toolbar">
        <div className="segmented-control" aria-label={uiText('팀 구분')}>
          {[
            ['all', uiText('전체')],
            ['RC', uiText('구조')],
            ['FIN', uiText('마감')],
          ].map(([value, label]) => (
            <button
              key={value}
              className={teamFilter === value ? 'is-active' : undefined}
              type="button"
              aria-pressed={teamFilter === value}
              onClick={() => setTeamFilter(value as 'all' | 'RC' | 'FIN')}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="status-badge status-pending">
          <UiText text="입력 매핑 필요" />
        </span>
      </div>
      <section className="glass-panel" aria-labelledby="formula-list-title">
        <div className="panel-heading">
          <div>
            <h2 id="formula-list-title">
              <UiText text="PM 확인 목록" />
            </h2>
            <p>
              <UiText text="원식·기대범위·실제값·단위·시트·셀 근거를 한 행에 보존합니다." />
            </p>
          </div>
          <span className="result-count">
            <UiText text="N/A · 미실행" />
          </span>
        </div>
        <section
          className="data-table-shell"
          aria-label={uiText('산출식 이상치 표')}
        >
          <table className="analytics-table">
            <thead>
              <tr>
                <th scope="col">
                  <UiText text="심각도" />
                </th>
                <th scope="col">
                  <UiText text="팀·공종" />
                </th>
                <th scope="col">
                  <UiText text="부위·품명" />
                </th>
                <th scope="col">
                  <UiText text="원 산출식" />
                </th>
                <th scope="col">
                  <UiText text="판정 근거" />
                </th>
                <th scope="col">
                  <UiText text="PM 처리" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="empty-table-cell">
                  {showExample
                    ? uiText(
                        '산출서와 집계표의 입력 매핑이 완료되면 PM 확인 목록이 표시됩니다.',
                      )
                    : uiText(
                        '구조 산출식 검수 엔진이 아직 연결되지 않았습니다.',
                      )}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        {showExample && (
          <aside
            className="prototype-note"
            aria-label={uiText('교육용 판정 예시')}
          >
            <Sparkles aria-hidden="true" />
            <span>
              <strong>
                <UiText text="교육용 예시 · 실제 결과 아님" />
              </strong>
              <code className="formula-danger">123455.1 × 12.5</code>{' '}
              <UiText text="내부 산출식이 건물 규모 대비 과도한지 PM이 확인하는 방식을 보여줍니다." />{' '}
            </span>
          </aside>
        )}
      </section>
    </div>
  );
}

function DuplicateWorkspace({ project }: { project: ProjectSummary }) {
  return (
    <div className="analytics-workspace">
      <h1 className="sr-only">
        <UiText text="중복 ITEM AI 검수" />
      </h1>
      <header className="review-module-context">
        <div>
          <span>
            <UiText text="현재 프로젝트" />
          </span>
          <strong>{project.name}</strong>
          <p>
            {' '}
            <UiText text="동별집계표의 전체 아이템을 기준으로 공종 오배치와 중복 품명·규격·재료코드를 확인합니다. 원본은 자동 병합하지 않습니다." />{' '}
          </p>
        </div>
        <span className="status-badge status-warning">
          {' '}
          <UiText text="부위 하드룰 우선 · PM 확정" />{' '}
        </span>
      </header>
      <section className="glass-panel" aria-labelledby="duplicate-title">
        <div className="panel-heading">
          <div>
            <h2 id="duplicate-title">
              <UiText text="공종 오배치 · 중복 아이템 확인" />
            </h2>
            <p>
              {' '}
              <UiText text="기준 자료: 동별집계표. 공종이 달라도 전체 아이템을 비교하며 품명·규격·단위·부위·적용범위를 함께 봅니다." />{' '}
            </p>
          </div>
          <span className="status-badge status-pending">
            {' '}
            <UiText text="N/A · 입력 매핑 필요" />{' '}
          </span>
        </div>
        <div className="merge-matrix-grid">
          <article className="merge-card merge-card-example">
            <div className="merge-card-heading">
              <span className="status-badge status-warning">
                {' '}
                <UiText text="교육용 예시 · 실제 후보 아님" />{' '}
              </span>
              <strong>
                <UiText text="외부 면처리 계열" />
              </strong>
            </div>
            <div className="merge-compare">
              <div>
                <span>
                  <UiText text="품명" />
                </span>
                <strong>
                  <UiText text="콘크리트면처리" />
                </strong>
                <small>
                  <UiText text="규격: 외부" />
                </small>
              </div>
              <div>
                <span>
                  <UiText text="품명" />
                </span>
                <strong>
                  <UiText text="견출" />
                </strong>
                <small>
                  <UiText text="규격: 외부" />
                </small>
              </div>
            </div>
            <dl className="merge-evidence">
              <div>
                <dt>
                  <UiText text="부위" />
                </dt>
                <dd>
                  <UiText text="외벽 ↔ 외벽" />
                </dd>
              </div>
              <div>
                <dt>
                  <UiText text="단위" />
                </dt>
                <dd>
                  <UiText text="매핑 전" />
                </dd>
              </div>
              <div>
                <dt>
                  <UiText text="범위" />
                </dt>
                <dd>
                  <UiText text="교집합 확인 필요" />
                </dd>
              </div>
            </dl>
            <button className="primary-action" type="button" disabled>
              {' '}
              <UiText text="예시 화면 · 실행 불가" />{' '}
            </button>
          </article>
          <article className="merge-card guardrail-card">
            <ShieldCheck aria-hidden="true" />
            <h3>
              <UiText text="자동 통합 금지" />
            </h3>
            <p>
              {' '}
              <UiText text="미장 아이템이 금속공사에 배치된 경우처럼 현재 공종과 예상 공종이 다른 항목은 ‘공종 오배치 의심’으로 구분하고 PM이 확인합니다. 공종이 다르다는 이유로 비교 대상에서 빼지 않습니다." />{' '}
            </p>
            <p>
              {' '}
              <UiText text="내벽≠외벽, 바닥≠천장, 바탕재≠최종마감재는 후보 단계에서 차단합니다." />{' '}
            </p>
            <span>
              <UiText text="조적은 후보·통계 계산에서 제외" />
            </span>
          </article>
        </div>
      </section>
    </div>
  );
}

function AnalysisOverviewWorkspace({ project }: { project: ProjectSummary }) {
  const uiText = useUiText();
  const sources = [
    ['설계개요', 'PDF·이미지', '연면적·건축면적·층 정보'],
    ['면적산정근거표', 'PDF·XLSX', '층별 기준면적과 산정 근거'],
    ['CONCOST CAD 면적도면', 'DXF', '폐합면적·층 라벨 입력'],
    ['최종마감재 산출서', 'XLSX', '부위별 최종마감 권위 수량'],
  ] as const;

  return (
    <div className="analytics-workspace">
      <ModuleHeading
        title={uiText('수량산출 분석표')}
        description={`${project.name}의 4대 원천을 같은 동·층 키로 맞춘 뒤 내부·외부 누락과 과다 면적을 비율로 표시합니다.`}
        status={uiText('4원천 모두 확인 후 확정')}
      />
      <div className="area-source-grid">
        {sources.map(([name, format, purpose], index) => (
          <article className="source-card" key={name}>
            <span className="source-index">0{index + 1}</span>
            <FileSpreadsheet aria-hidden="true" />
            <div>
              <h2>{name}</h2>
              <p>{purpose}</p>
            </div>
            <span className="source-format">{format}</span>
            <strong>
              <UiText text="미등록" />
            </strong>
          </article>
        ))}
      </div>
      <section className="glass-panel" aria-labelledby="area-table-title">
        <div className="panel-heading">
          <div>
            <h2 id="area-table-title">
              <UiText text="내부·외부 층별 대조표" />
            </h2>
            <p>
              {' '}
              <UiText text="미확정 원천은 0이 아니라 N/A로 보존하며 조적은 계산에서 제외합니다." />{' '}
            </p>
          </div>
          <span className="status-badge status-pending">
            <UiText text="N/A · 원천 미등록" />
          </span>
        </div>
        <section
          className="data-table-shell"
          aria-label={uiText('층별 면적 대조표')}
        >
          <table className="analytics-table area-table">
            <thead>
              <tr>
                <th scope="col">
                  <UiText text="동·층" />
                </th>
                <th scope="col">
                  <UiText text="설계면적" />
                </th>
                <th scope="col">
                  <UiText text="근거표" />
                </th>
                <th scope="col">CAD</th>
                <th scope="col">
                  <UiText text="최종마감" />
                </th>
                <th scope="col">
                  <UiText text="누락률" />
                </th>
                <th scope="col">
                  <UiText text="판정" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="empty-table-cell">
                  {' '}
                  <UiText text="4대 원천을 등록하면 내부·외부 층별 분석표가 생성됩니다." />{' '}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <aside className="prototype-note">
          <ShieldCheck aria-hidden="true" />
          <span>
            {' '}
            <UiText text="조적은 동일 아이템·면적·경험통계 계산에서 제외하고 제외 건수와 수량만 감사 기록으로 남깁니다." />{' '}
          </span>
        </aside>
      </section>
      <section
        className="glass-panel report-builder"
        aria-labelledby="excel-title"
      >
        <div className="panel-heading">
          <div>
            <h2 id="excel-title">
              <UiText text="거래처 제출용 Excel 분석표" />
            </h2>
            <p>
              {' '}
              <UiText text="검토 완료값, 미검증 범위, 규칙 버전과 원본 계보를 함께 냅니다." />{' '}
            </p>
          </div>
          <span className="status-badge status-pending">
            <UiText text="출력 조건 미충족" />
          </span>
        </div>
        <button className="primary-action" type="button" disabled>
          <Download aria-hidden="true" /> <UiText text="Excel 다운로드" />{' '}
        </button>
      </section>
    </div>
  );
}

function TradeAnalysisWorkspace({
  project,
  metadata,
}: {
  project: ProjectSummary;
  metadata: TradeMetadata;
}) {
  const uiText = useUiText();
  if (metadata.trade === '조적') {
    return <MasonryAuditWorkspace project={project} />;
  }

  return (
    <div className="analytics-workspace">
      <ModuleHeading
        title={`${metadata.team} · ${metadata.trade} 공종별 분석표`}
        description={`${project.name}의 ${metadata.trade} 산출서와 집계표를 ${metadata.code} 계보 안에서 비교합니다.`}
        status={uiText('N/A · 입력 매핑 필요')}
      />
      <section className="glass-panel" aria-labelledby="trade-analysis-title">
        <div className="panel-heading">
          <div>
            <h2 id="trade-analysis-title">
              <UiText text="공종별 수량 대조" />
            </h2>
            <p>
              {' '}
              <UiText text="품명·규격·단위·부위·동·층·산출근거가 연결된 행만 분석에 포함합니다." />{' '}
            </p>
          </div>
          <span className="result-count">
            <UiText text="N/A · 미실행" />
          </span>
        </div>
        <section
          className="data-table-shell"
          aria-label={`${metadata.trade} 공종별 분석표`}
        >
          <table className="analytics-table">
            <thead>
              <tr>
                <th scope="col">
                  <UiText text="품명·규격" />
                </th>
                <th scope="col">
                  <UiText text="부위" />
                </th>
                <th scope="col">
                  <UiText text="단위" />
                </th>
                <th scope="col">
                  <UiText text="산출 수량" />
                </th>
                <th scope="col">
                  <UiText text="집계 수량" />
                </th>
                <th scope="col">
                  <UiText text="차이" />
                </th>
                <th scope="col">
                  <UiText text="판정" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="empty-table-cell">
                  {metadata.trade}{' '}
                  <UiText text="공종의 산출서와 집계표 입력 매핑이 완료되지 않았습니다." />{' '}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </section>
    </div>
  );
}

function MasonryAuditWorkspace({ project }: { project: ProjectSummary }) {
  const uiText = useUiText();
  return (
    <div className="analytics-workspace">
      <ModuleHeading
        title={uiText('마감 · 조적 수량 분석표')}
        description={`${project.name}의 조적 행을 검수 계산에 넣지 않고 제외 건수·수량·원본 계보만 감사합니다.`}
        status={uiText('SYSTEM_HARD_RULE · 계산 제외')}
      />
      <section className="glass-panel" aria-labelledby="masonry-audit-title">
        <div className="panel-heading">
          <div>
            <h2 id="masonry-audit-title">
              <UiText text="조적 제외 감사표" />
            </h2>
            <p>
              {' '}
              <UiText text="AI 검수·동일 아이템·면적분석·경험통계에는 포함하지 않으며 excluded_reason만 보존합니다." />{' '}
            </p>
          </div>
          <span className="result-count">
            <UiText text="N/A · 제외 계보 미등록" />
          </span>
        </div>
        <section
          className="data-table-shell"
          aria-label={uiText('조적 제외 감사표')}
        >
          <table className="analytics-table">
            <thead>
              <tr>
                <th scope="col">
                  <UiText text="원본 파일" />
                </th>
                <th scope="col">
                  <UiText text="시트·행" />
                </th>
                <th scope="col">
                  <UiText text="품명·규격" />
                </th>
                <th scope="col">
                  <UiText text="단위" />
                </th>
                <th scope="col">
                  <UiText text="제외 수량" />
                </th>
                <th scope="col">
                  <UiText text="제외 사유" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="empty-table-cell">
                  {' '}
                  <UiText text="조적 산출서와 집계표의 제외 계보가 아직 등록되지 않았습니다." />{' '}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </section>
    </div>
  );
}

function SettingsWorkspace({ isAdmin }: { isAdmin: boolean }) {
  return <PersonalAiSettings isAdmin={isAdmin} />;
}
