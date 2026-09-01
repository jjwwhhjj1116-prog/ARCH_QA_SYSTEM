'use client';

import {
  BarChart3,
  Building2,
  Download,
  FileScan,
  FileSpreadsheet,
  FolderKanban,
  Layers3,
  LayoutDashboard,
  LockKeyhole,
  Ruler,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { ProjectSummary, ReviewCaseSummary } from '@/lib/domain/contracts';

export type StudioView =
  | 'overview'
  | 'projects'
  | 'formula'
  | 'duplicates'
  | 'area'
  | 'discipline'
  | 'reports';

export const studioNavigation = [
  { id: 'overview', label: '종합 대시보드', icon: LayoutDashboard },
  { id: 'projects', label: '프로젝트·자료', icon: FolderKanban },
  { id: 'formula', label: '산출식 이상치', icon: FileScan },
  { id: 'duplicates', label: '중복 아이템', icon: Layers3 },
  { id: 'area', label: '면적 분석표', icon: Ruler },
  { id: 'discipline', label: '공종별 검수', icon: Building2 },
  { id: 'reports', label: '보고서·Excel', icon: BarChart3 },
] as const;

type ModuleWorkspaceProps = {
  view: Exclude<StudioView, 'projects'>;
  selectedProject: ProjectSummary | null;
  reviewCases: ReviewCaseSummary[];
  onOpenProjects: () => void;
};

const structureTrades = [
  '보',
  '슬라브',
  '기둥',
  '옹벽',
  '기초',
  '아파트옹벽',
  '아파트슬라브',
] as const;
const finishTrades = ['조적', '창호', '내부', '외부', '가설'] as const;

export function ModuleWorkspace({
  view,
  selectedProject,
  reviewCases,
  onOpenProjects,
}: ModuleWorkspaceProps) {
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
            프로젝트 경계를 확정한 뒤 산출서와 집계표를 연결해야 검수 결과가
            다른 현장과 섞이지 않습니다.
          </p>
        </div>
        <button
          className="primary-action"
          type="button"
          onClick={onOpenProjects}
        >
          프로젝트 선택
        </button>
      </section>
    );
  }

  if (view === 'overview') {
    const structureCases = reviewCases.filter(
      (reviewCase) => reviewCase.discipline === 'RC',
    ).length;
    const finishCases = reviewCases.filter(
      (reviewCase) => reviewCase.discipline === 'FIN',
    ).length;
    return (
      <div className="analytics-workspace">
        <ModuleHeading
          title={selectedProject.name}
          description="물량산출 완료 후 검수 상태를 한 화면에서 확인합니다. 미실행 항목은 정상으로 계산하지 않습니다."
          status="ERP 프로젝트명 수동 등록 · 연동 대기"
        />
        <div className="kpi-grid" aria-label="프로젝트 검수 요약">
          <KpiCard
            tone="cyan"
            label="검수 케이스"
            value={`${reviewCases.length}`}
            unit="건"
            note="구조와 마감을 독립 계보로 관리"
          />
          <KpiCard
            tone="emerald"
            label="구조 검수"
            value={`${structureCases}`}
            unit="건"
            note="보·슬라브·기둥·옹벽·기초"
          />
          <KpiCard
            tone="amber"
            label="마감 검수"
            value={`${finishCases}`}
            unit="건"
            note="창호·내부·외부·가설 / 조적 별도"
          />
          <KpiCard
            tone="red"
            label="확인 필요"
            value={`${selectedProject.needsAttentionCount}`}
            unit="건"
            note="검수 엔진 연결 전에는 미실행"
          />
        </div>

        <section
          className="glass-panel readiness-board"
          aria-labelledby="readiness-board-title"
        >
          <div className="panel-heading">
            <div>
              <h2 id="readiness-board-title">검수 모듈 준비상태</h2>
              <p>
                실제 API·근거 계보가 없는 결과는 완료나 정상으로 표시하지
                않습니다.
              </p>
            </div>
            <span className="status-badge status-pending">엔진 연결 전</span>
          </div>
          <div className="readiness-matrix">
            <ReadinessItem
              icon={FileScan}
              title="산출식 이상치"
              description="과도한 길이·면적·반복계수와 건물 규모 대비 이상식을 검토합니다."
            />
            <ReadinessItem
              icon={Layers3}
              title="중복 아이템"
              description="품명·규격·부위·단위·범위 근거를 비교하고 PM 통합 후보를 제시합니다."
            />
            <ReadinessItem
              icon={Ruler}
              title="4원천 면적분석"
              description="설계개요·면적근거표·CAD·최종마감 산출서를 층별로 대조합니다."
            />
            <ReadinessItem
              icon={Download}
              title="Excel 분석표"
              description="확정 결과와 미검증 범위·규칙 버전·원본 계보를 함께 내보냅니다."
            />
          </div>
        </section>
      </div>
    );
  }

  if (view === 'formula') return <FormulaWorkspace project={selectedProject} />;
  if (view === 'duplicates')
    return <DuplicateWorkspace project={selectedProject} />;
  if (view === 'area') return <AreaWorkspace project={selectedProject} />;
  if (view === 'discipline')
    return <DisciplineWorkspace project={selectedProject} />;
  return <ReportsWorkspace project={selectedProject} />;
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

function KpiCard({
  tone,
  label,
  value,
  unit,
  note,
}: {
  tone: 'cyan' | 'emerald' | 'amber' | 'red';
  label: string;
  value: string;
  unit: string;
  note: string;
}) {
  return (
    <article className={`kpi-card tone-${tone}`}>
      <span className="kpi-label">{label}</span>
      <p className="kpi-value-row">
        <strong className="kpi-value">{value}</strong>
        <span>{unit}</span>
      </p>
      <small>{note}</small>
    </article>
  );
}

function ReadinessItem({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <article className="readiness-item">
      <Icon aria-hidden="true" />
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <span>미실행</span>
    </article>
  );
}

function FormulaWorkspace({ project }: { project: ProjectSummary }) {
  const [teamFilter, setTeamFilter] = useState<'all' | 'RC' | 'FIN'>('all');
  const showExample = teamFilter !== 'RC';
  return (
    <div className="analytics-workspace">
      <ModuleHeading
        title="산출식 이상치 검수"
        description={`${project.name}의 원 산출식을 부위·단위·건물 규모와 교차검토하고 PM 확인 목록으로 만듭니다.`}
        status="결정론 우선 · AI는 설명만"
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
        <span className="status-badge status-pending">자료 매핑 필요</span>
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
                    ? '실제 산출서와 집계표 매핑 후 PM 확인 목록이 표시됩니다.'
                    : '구조 검수 엔진이 아직 연결되지 않았습니다.'}
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
        title="중복 아이템 통합 검토"
        description={`${project.name}에서 여러 산출자가 만든 품목을 비교하되 원본은 자동 병합하지 않습니다.`}
        status="부위 하드룰 우선"
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
            실제 후보 N/A · 미실행
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

function AreaWorkspace({ project }: { project: ProjectSummary }) {
  const sources = [
    ['설계개요', 'PDF·이미지', '연면적·건축면적·층 정보'],
    ['면적산정근거표', 'PDF·XLSX', '층별 기준면적과 산정 근거'],
    ['CONCOST CAD 면적도면', 'DXF', 'ezdxf 연결 전 · 폐합면적·층 라벨 대기'],
    ['최종마감재 산출서', 'XLSX', '부위별 최종마감 권위 수량'],
  ] as const;
  return (
    <div className="analytics-workspace">
      <ModuleHeading
        title="층별 면적 정합성 분석"
        description={`${project.name}의 4대 원천을 같은 동·층 키로 맞춘 뒤 누락·과다 면적을 비율로 표시합니다.`}
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
            <h2 id="area-table-title">층별 대조표</h2>
            <p>미확정 원천은 0이 아니라 N/A로 보존합니다.</p>
          </div>
          <span className="status-badge status-pending">원천 미연결</span>
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
                  4대 원천을 등록하면 층별 분석표가 생성됩니다.
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </section>
    </div>
  );
}

function DisciplineWorkspace({ project }: { project: ProjectSummary }) {
  return (
    <div className="analytics-workspace">
      <ModuleHeading
        title="구조·마감 공종별 검수"
        description={`${project.name}의 검수 결과를 팀과 공종 기준으로 분리해 PM이 책임 범위별로 확인합니다.`}
        status="공종 경계 고정"
      />
      <div className="discipline-grid">
        <TradePanel title="구조" code="RC" trades={structureTrades} />
        <TradePanel title="마감" code="FIN" trades={finishTrades} masonry />
      </div>
    </div>
  );
}

function TradePanel({
  title,
  code,
  trades,
  masonry = false,
}: {
  title: string;
  code: string;
  trades: readonly string[];
  masonry?: boolean;
}) {
  return (
    <section
      className="glass-panel trade-panel"
      aria-labelledby={`trade-${code}`}
    >
      <div className="panel-heading">
        <div>
          <h2 id={`trade-${code}`}>{title}팀</h2>
          <p>{code} 계보와 결과를 독립 관리합니다.</p>
        </div>
        <span className="status-badge status-pending">미실행</span>
      </div>
      <div className="trade-chip-list">
        {trades.map((trade) => (
          <button key={trade} type="button" disabled>
            {trade}
            {masonry && trade === '조적' && <small>계산 제외·감사만</small>}
          </button>
        ))}
      </div>
      <p className="panel-footnote">
        산출서와 집계표 semantic 매핑 완료 후 공종별 결과가 활성화됩니다.
      </p>
    </section>
  );
}

function ReportsWorkspace({ project }: { project: ProjectSummary }) {
  return (
    <div className="analytics-workspace">
      <ModuleHeading
        title="Excel 분석표·검수 보고서"
        description={`${project.name}의 확정 결과와 근거 계보를 감사 가능한 Excel로 출력합니다.`}
        status="결과 확정 후 출력"
      />
      <section
        className="glass-panel report-builder"
        aria-labelledby="report-title"
      >
        <div className="panel-heading">
          <div>
            <h2 id="report-title">보고서 구성</h2>
            <p>
              검토되지 않은 결과와 미확정 원천은 보고서에서 명시적으로
              구분합니다.
            </p>
          </div>
          <span className="status-badge status-pending">출력 엔진 준비 중</span>
        </div>
        <div className="report-layout">
          <ol className="report-sheet-list">
            {[
              '종합 요약',
              '산출식 이상치',
              '중복 아이템',
              '층별 면적분석',
              '구조·마감 공종별',
            ].map((sheet) => (
              <li key={sheet}>
                <LockKeyhole aria-hidden="true" />
                <span>{sheet}</span>
                <small>결과 확정 후 생성</small>
              </li>
            ))}
          </ol>
          <div className="report-action-panel">
            <Download aria-hidden="true" />
            <strong>Excel 분석표</strong>
            <p>
              선택 프로젝트의 검수 실행·승인 결과가 아직 없어 출력을 잠급니다.
            </p>
            <button className="primary-action" type="button" disabled>
              Excel 다운로드
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
