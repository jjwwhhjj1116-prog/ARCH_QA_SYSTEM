'use client';

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
import { useEffect, useState } from 'react';
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  ProjectSummary,
  ReviewCaseSummary,
} from '@/lib/domain/contracts';
import type { GeminiConfigurationStatus } from '@/lib/server/ai/gemini-config';
import type { Mem0ConfigurationStatus } from '@/lib/server/memory/mem0-rest';

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
  view,
  selectedProject,
  onOpenProjects,
}: ModuleWorkspaceProps) {
  if (view === 'settings') return <SettingsWorkspace />;

  if (!selectedProject) {
    return (
      <section
        className="module-empty-state"
        aria-labelledby="module-empty-title"
      >
        <LockKeyhole aria-hidden="true" />
        <div>
          <h1 id="module-empty-title">검수 프로젝트를 먼저 선택하세요</h1>
          <p>
            프로젝트 경계를 확정하고 산출서와 집계표를 등록해야 다음 단계의
            결과가 다른 현장과 섞이지 않습니다.
          </p>
        </div>
        <button
          className="primary-action"
          type="button"
          onClick={onOpenProjects}
        >
          프로젝트 등록·선택으로 이동
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
  const [teamFilter, setTeamFilter] = useState<'all' | 'RC' | 'FIN'>('all');
  const showExample = teamFilter !== 'RC';

  return (
    <div className="analytics-workspace">
      <ModuleHeading
        title="산출식 AI 검수"
        description={`${project.name}의 원 산출식을 부위·단위·건물 규모와 교차검토하고 PM 확인 목록으로 만듭니다.`}
        status="Level A 결정론 우선 · AI는 설명만"
      />
      <div className="module-toolbar">
        <div className="segmented-control" aria-label="팀 구분">
          {[
            ['all', '전체'],
            ['RC', '구조'],
            ['FIN', '마감'],
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
        <span className="status-badge status-pending">입력 매핑 필요</span>
      </div>
      <section className="glass-panel" aria-labelledby="formula-list-title">
        <div className="panel-heading">
          <div>
            <h2 id="formula-list-title">PM 확인 목록</h2>
            <p>원식·기대범위·실제값·단위·시트·셀 근거를 한 행에 보존합니다.</p>
          </div>
          <span className="result-count">N/A · 미실행</span>
        </div>
        <section className="data-table-shell" aria-label="산출식 이상치 표">
          <table className="analytics-table">
            <thead>
              <tr>
                <th scope="col">심각도</th>
                <th scope="col">팀·공종</th>
                <th scope="col">부위·품명</th>
                <th scope="col">원 산출식</th>
                <th scope="col">판정 근거</th>
                <th scope="col">PM 처리</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="empty-table-cell">
                  {showExample
                    ? '산출서와 집계표의 입력 매핑이 완료되면 PM 확인 목록이 표시됩니다.'
                    : '구조 산출식 검수 엔진이 아직 연결되지 않았습니다.'}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        {showExample && (
          <aside className="prototype-note" aria-label="교육용 판정 예시">
            <Sparkles aria-hidden="true" />
            <span>
              <strong>교육용 예시 · 실제 결과 아님</strong>
              <code className="formula-danger">123455.1 × 12.5</code> 내부
              산출식이 건물 규모 대비 과도한지 PM이 확인하는 방식을 보여줍니다.
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
      <ModuleHeading
        title="중복 아이템 AI 검수"
        description={`${project.name}에서 여러 산출자가 만든 품목을 비교하되 원본은 자동 병합하지 않습니다.`}
        status="부위 하드룰 우선 · PM 확정"
      />
      <section className="glass-panel" aria-labelledby="duplicate-title">
        <div className="panel-heading">
          <div>
            <h2 id="duplicate-title">재료코드 통합 후보</h2>
            <p>
              품명과 괄호 안 규격, 단위, 부위, 적용범위 교집합을 함께 봅니다.
            </p>
          </div>
          <span className="status-badge status-pending">
            N/A · 입력 매핑 필요
          </span>
        </div>
        <div className="merge-matrix-grid">
          <article className="merge-card merge-card-example">
            <div className="merge-card-heading">
              <span className="status-badge status-warning">
                교육용 예시 · 실제 후보 아님
              </span>
              <strong>외부 면처리 계열</strong>
            </div>
            <div className="merge-compare">
              <div>
                <span>품명</span>
                <strong>콘크리트면처리</strong>
                <small>규격: 외부</small>
              </div>
              <div>
                <span>품명</span>
                <strong>견출</strong>
                <small>규격: 외부</small>
              </div>
            </div>
            <dl className="merge-evidence">
              <div>
                <dt>부위</dt>
                <dd>외벽 ↔ 외벽</dd>
              </div>
              <div>
                <dt>단위</dt>
                <dd>매핑 전</dd>
              </div>
              <div>
                <dt>범위</dt>
                <dd>교집합 확인 필요</dd>
              </div>
            </dl>
            <button className="primary-action" type="button" disabled>
              예시 화면 · 실행 불가
            </button>
          </article>
          <article className="merge-card guardrail-card">
            <ShieldCheck aria-hidden="true" />
            <h3>자동 통합 금지</h3>
            <p>
              내벽≠외벽, 바닥≠천장, 바탕재≠최종마감재는 후보 단계에서
              차단합니다.
            </p>
            <span>조적은 후보·통계 계산에서 제외</span>
          </article>
        </div>
      </section>
    </div>
  );
}

function AnalysisOverviewWorkspace({ project }: { project: ProjectSummary }) {
  const sources = [
    ['설계개요', 'PDF·이미지', '연면적·건축면적·층 정보'],
    ['면적산정근거표', 'PDF·XLSX', '층별 기준면적과 산정 근거'],
    ['CONCOST CAD 면적도면', 'DXF', '폐합면적·층 라벨 입력'],
    ['최종마감재 산출서', 'XLSX', '부위별 최종마감 권위 수량'],
  ] as const;

  return (
    <div className="analytics-workspace">
      <ModuleHeading
        title="수량산출 분석표"
        description={`${project.name}의 4대 원천을 같은 동·층 키로 맞춘 뒤 내부·외부 누락과 과다 면적을 비율로 표시합니다.`}
        status="4원천 모두 확인 후 확정"
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
            <strong>미등록</strong>
          </article>
        ))}
      </div>
      <section className="glass-panel" aria-labelledby="area-table-title">
        <div className="panel-heading">
          <div>
            <h2 id="area-table-title">내부·외부 층별 대조표</h2>
            <p>
              미확정 원천은 0이 아니라 N/A로 보존하며 조적은 계산에서
              제외합니다.
            </p>
          </div>
          <span className="status-badge status-pending">N/A · 원천 미등록</span>
        </div>
        <section className="data-table-shell" aria-label="층별 면적 대조표">
          <table className="analytics-table area-table">
            <thead>
              <tr>
                <th scope="col">동·층</th>
                <th scope="col">설계면적</th>
                <th scope="col">근거표</th>
                <th scope="col">CAD</th>
                <th scope="col">최종마감</th>
                <th scope="col">누락률</th>
                <th scope="col">판정</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="empty-table-cell">
                  4대 원천을 등록하면 내부·외부 층별 분석표가 생성됩니다.
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <aside className="prototype-note">
          <ShieldCheck aria-hidden="true" />
          <span>
            조적은 동일 아이템·면적·경험통계 계산에서 제외하고 제외 건수와
            수량만 감사 기록으로 남깁니다.
          </span>
        </aside>
      </section>
      <section
        className="glass-panel report-builder"
        aria-labelledby="excel-title"
      >
        <div className="panel-heading">
          <div>
            <h2 id="excel-title">거래처 제출용 Excel 분석표</h2>
            <p>
              검토 완료값, 미검증 범위, 규칙 버전과 원본 계보를 함께 냅니다.
            </p>
          </div>
          <span className="status-badge status-pending">출력 조건 미충족</span>
        </div>
        <button className="primary-action" type="button" disabled>
          <Download aria-hidden="true" /> Excel 다운로드
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
  if (metadata.trade === '조적') {
    return <MasonryAuditWorkspace project={project} />;
  }

  return (
    <div className="analytics-workspace">
      <ModuleHeading
        title={`${metadata.team} · ${metadata.trade} 공종별 분석표`}
        description={`${project.name}의 ${metadata.trade} 산출서와 집계표를 ${metadata.code} 계보 안에서 비교합니다.`}
        status="N/A · 입력 매핑 필요"
      />
      <section className="glass-panel" aria-labelledby="trade-analysis-title">
        <div className="panel-heading">
          <div>
            <h2 id="trade-analysis-title">공종별 수량 대조</h2>
            <p>
              품명·규격·단위·부위·동·층·산출근거가 연결된 행만 분석에
              포함합니다.
            </p>
          </div>
          <span className="result-count">N/A · 미실행</span>
        </div>
        <section
          className="data-table-shell"
          aria-label={`${metadata.trade} 공종별 분석표`}
        >
          <table className="analytics-table">
            <thead>
              <tr>
                <th scope="col">품명·규격</th>
                <th scope="col">부위</th>
                <th scope="col">단위</th>
                <th scope="col">산출 수량</th>
                <th scope="col">집계 수량</th>
                <th scope="col">차이</th>
                <th scope="col">판정</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="empty-table-cell">
                  {metadata.trade} 공종의 산출서와 집계표 입력 매핑이 완료되지
                  않았습니다.
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
  return (
    <div className="analytics-workspace">
      <ModuleHeading
        title="마감 · 조적 수량 분석표"
        description={`${project.name}의 조적 행을 검수 계산에 넣지 않고 제외 건수·수량·원본 계보만 감사합니다.`}
        status="SYSTEM_HARD_RULE · 계산 제외"
      />
      <section className="glass-panel" aria-labelledby="masonry-audit-title">
        <div className="panel-heading">
          <div>
            <h2 id="masonry-audit-title">조적 제외 감사표</h2>
            <p>
              AI 검수·동일 아이템·면적분석·경험통계에는 포함하지 않으며
              excluded_reason만 보존합니다.
            </p>
          </div>
          <span className="result-count">N/A · 제외 계보 미등록</span>
        </div>
        <section className="data-table-shell" aria-label="조적 제외 감사표">
          <table className="analytics-table">
            <thead>
              <tr>
                <th scope="col">원본 파일</th>
                <th scope="col">시트·행</th>
                <th scope="col">품명·규격</th>
                <th scope="col">단위</th>
                <th scope="col">제외 수량</th>
                <th scope="col">제외 사유</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="empty-table-cell">
                  조적 산출서와 집계표의 제외 계보가 아직 등록되지 않았습니다.
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </section>
    </div>
  );
}

function SettingsWorkspace() {
  const [aiStatus, setAiStatus] = useState<GeminiConfigurationStatus | null>(
    null,
  );
  const [aiMessage, setAiMessage] = useState('Gemini 서버 설정을 확인하는 중…');
  const [memoryStatus, setMemoryStatus] =
    useState<Mem0ConfigurationStatus | null>(null);
  const [memoryMessage, setMemoryMessage] = useState(
    '공유 개발 메모리 설정을 확인하는 중…',
  );
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/settings/ai', {
          cache: 'no-store',
        });
        const body = (await response.json()) as
          | ApiSuccessEnvelope<GeminiConfigurationStatus>
          | ApiErrorEnvelope;
        if (!response.ok || 'error' in body) {
          throw new Error(
            'error' in body
              ? body.error.message
              : 'Gemini 설정을 확인하지 못했습니다.',
          );
        }
        if (cancelled) return;
        setAiStatus(body.data);
        setAiMessage(
          body.data.status === 'ready'
            ? '서버에 비밀키와 허용 모델이 등록되어 있습니다.'
            : body.data.status === 'not_configured'
              ? 'Sites 서버 환경변수에 API 키를 등록해야 합니다.'
              : '허용 모델 또는 서버 환경변수 구성을 확인하세요.',
        );
      } catch (error) {
        if (cancelled) return;
        setAiMessage(
          error instanceof Error
            ? error.message
            : 'Gemini 설정을 확인하지 못했습니다.',
        );
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/settings/memory', {
          cache: 'no-store',
        });
        const body = (await response.json()) as
          | ApiSuccessEnvelope<Mem0ConfigurationStatus>
          | ApiErrorEnvelope;
        if (!response.ok || 'error' in body) {
          throw new Error(
            'error' in body
              ? body.error.message
              : '공유 메모리 설정을 확인하지 못했습니다.',
          );
        }
        if (cancelled) return;
        setMemoryStatus(body.data);
        setMemoryMessage(
          body.data.status === 'ready'
            ? '로컬 개발 도구와 웹이 같은 Mem0 프로젝트를 조회할 준비가 되었습니다.'
            : body.data.status === 'not_configured'
              ? 'Mem0 Platform 서버 비밀키를 등록하면 공유 조회를 활성화할 수 있습니다.'
              : '현재는 안전하게 비활성 상태입니다. D1·R2 검수 원본에는 영향이 없습니다.',
        );
      } catch (error) {
        if (cancelled) return;
        setMemoryMessage(
          error instanceof Error
            ? error.message
            : '공유 메모리 설정을 확인하지 못했습니다.',
        );
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function testConnection() {
    setTesting(true);
    setAiMessage('Gemini 연결을 확인하는 중…');
    try {
      const response = await fetch('/api/settings/ai/connection-test', {
        method: 'POST',
      });
      const body = (await response.json()) as
        | ApiSuccessEnvelope<{ status: 'connected'; model: string }>
        | ApiErrorEnvelope;
      if (!response.ok || 'error' in body) {
        throw new Error(
          'error' in body ? body.error.message : 'Gemini 연결에 실패했습니다.',
        );
      }
      setAiMessage(`${body.data.model} 연결 확인 완료`);
    } catch (error) {
      setAiMessage(
        error instanceof Error ? error.message : 'Gemini 연결에 실패했습니다.',
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="analytics-workspace">
      <ModuleHeading
        title="설정"
        description="승인 계정, Gemini AI, ERP 프로젝트 연동과 검수 규칙 프로필 상태를 관리합니다."
        status="서버 보안 설정"
      />
      <section
        className="glass-panel ai-settings-panel"
        aria-labelledby="ai-settings-title"
      >
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">AI PROVIDER</span>
            <h2 id="ai-settings-title">Gemini API 연동</h2>
            <p>
              API 키는 브라우저·D1·로그에 저장하지 않고 Sites 서버
              환경변수에서만 읽습니다.
            </p>
          </div>
          <span
            className={`status-badge ${aiStatus?.status === 'ready' ? 'status-ready' : 'status-pending'}`}
          >
            {aiStatus?.status === 'ready'
              ? '설정 완료'
              : aiStatus?.status === 'invalid_configuration'
                ? '설정 오류'
                : '미연결'}
          </span>
        </div>
        <div className="ai-settings-grid">
          <dl>
            <div>
              <dt>Provider</dt>
              <dd>Google Gemini</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{aiStatus?.model ?? 'N/A · 미등록'}</dd>
            </div>
            <div>
              <dt>Secret</dt>
              <dd>서버 전용 · 화면 비노출</dd>
            </div>
            <div>
              <dt>Review</dt>
              <dd>데이터 매핑 완료 전 미실행</dd>
            </div>
          </dl>
          <div className="ai-settings-actions">
            <output aria-live="polite">{aiMessage}</output>
            <button
              className="primary-action"
              type="button"
              disabled={aiStatus?.status !== 'ready' || testing}
              onClick={() => void testConnection()}
            >
              {testing ? '연결 확인 중…' : 'Gemini 연결 시험'}
            </button>
          </div>
        </div>
      </section>
      <section
        className="glass-panel ai-settings-panel"
        aria-labelledby="memory-settings-title"
      >
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">SHARED DEVELOPMENT MEMORY</span>
            <h2 id="memory-settings-title">Mem0 공유 메모리</h2>
            <p>
              프로젝트 규칙과 작업 맥락을 검색하는 보조 계층입니다. 산출서 원본,
              판정 결과와 감사 기록의 기준 저장소는 계속 Cloudflare D1·R2입니다.
            </p>
          </div>
          <span
            className={`status-badge ${memoryStatus?.status === 'ready' ? 'status-ready' : 'status-pending'}`}
          >
            {memoryStatus?.status === 'ready'
              ? '조회 준비 완료'
              : memoryStatus?.status === 'not_configured'
                ? '키 미등록'
                : '비활성'}
          </span>
        </div>
        <div className="ai-settings-grid">
          <dl>
            <div>
              <dt>Mode</dt>
              <dd>{memoryStatus?.mode ?? 'disabled'}</dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>{memoryStatus?.sharedAgentId ?? 'concost-qc-shared-v1'}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>프로젝트 멤버만 · 읽기 전용</dd>
            </div>
            <div>
              <dt>Workbook</dt>
              <dd>원본·수식·수량 외부 전송 금지</dd>
            </div>
          </dl>
          <div className="ai-settings-actions">
            <output aria-live="polite">{memoryMessage}</output>
            <span className="settings-safety-note">
              쓰기 API는 아직 닫혀 있습니다. 운영 정책 승인 후 별도
              활성화합니다.
            </span>
          </div>
        </div>
      </section>
      <section className="glass-panel" aria-labelledby="settings-title">
        <div className="panel-heading">
          <div>
            <h2 id="settings-title">연동 및 정책 상태</h2>
            <p>
              현재 화면은 상태만 공개합니다. 서버 정책과 감사 기록이 없는 설정을
              활성 상태로 표시하지 않습니다.
            </p>
          </div>
          <span className="status-badge status-pending">N/A · 미구현</span>
        </div>
        <div className="readiness-matrix">
          <SettingsStatus title="승인 계정 정책" state="서버 적용" />
          <SettingsStatus title="ERP 프로젝트 연동" />
          <SettingsStatus title="검수 규칙 프로필" />
          <SettingsStatus title="Excel 출력 정책" />
        </div>
      </section>
    </div>
  );
}

function SettingsStatus({
  title,
  state = '미연결',
}: {
  title: string;
  state?: string;
}) {
  return (
    <article className="readiness-item">
      <Settings aria-hidden="true" />
      <div>
        <h3>{title}</h3>
        <p>서버 계약과 운영 권한 연결 후 활성화됩니다.</p>
      </div>
      <span>{state}</span>
    </article>
  );
}
