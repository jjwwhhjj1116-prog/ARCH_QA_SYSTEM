'use client';

import {
  AlertTriangle,
  Check,
  ChevronRight,
  Database,
  FileCheck2,
  FileSpreadsheet,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { SyntheticEvent } from 'react';
import type { ProjectSummary } from '@/lib/domain/contracts';

type Props = {
  projects: ProjectSummary[];
  visibleProjects: ProjectSummary[];
  loadState: 'loading' | 'ready' | 'error';
  message: string;
  messageTone: 'neutral' | 'success' | 'error';
  showCreate: boolean;
  submitting: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onToggleCreate: () => void;
  onRetry: () => void;
  onCreateProject: (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => void;
  onSelectAndContinue: (projectId: string) => void;
};

export function ProjectRegistrationWorkspace({
  projects,
  visibleProjects,
  loadState,
  message,
  messageTone,
  showCreate,
  submitting,
  query,
  onQueryChange,
  onToggleCreate,
  onRetry,
  onCreateProject,
  onSelectAndContinue,
}: Props) {
  return (
    <section
      className="project-workspace stage-workspace"
      data-stage="register"
      aria-labelledby="page-title"
    >
      <StageHeading
        eyebrow="1 / 5 · 프로젝트 등록"
        title="검수 프로젝트를 선택하세요"
        description="ERP 그룹웨어와 동일한 프로젝트명으로 등록한 뒤, 선택한 프로젝트의 자료 등록 단계로 이동합니다."
        action={
          <button
            className="primary-action"
            type="button"
            onClick={onToggleCreate}
          >
            <Plus aria-hidden="true" /> 새 프로젝트 등록
          </button>
        }
      />

      <output className={`system-message ${messageTone}`} aria-live="polite">
        {messageTone === 'error' ? (
          <AlertTriangle aria-hidden="true" />
        ) : (
          <Database aria-hidden="true" />
        )}
        <span>{message}</span>
        {loadState === 'error' && (
          <button type="button" onClick={onRetry}>
            다시 시도
          </button>
        )}
      </output>

      {showCreate && (
        <form className="create-project-panel" onSubmit={onCreateProject}>
          <div className="form-heading">
            <div>
              <span className="panel-kicker">PROJECT REGISTRATION</span>
              <h2>새 프로젝트 등록</h2>
              <p>
                프로젝트 코드는 입력하지 않습니다. ERP와 같은 프로젝트명을
                사용하세요.
              </p>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="등록 화면 닫기"
              onClick={onToggleCreate}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <div className="form-grid">
            <label>
              프로젝트명
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                placeholder="예: 덕천3구역 재건축"
              />
            </label>
            <label>
              발주처·고객사 <span>(선택)</span>
              <input
                name="clientName"
                maxLength={120}
                placeholder="예: 한화건설"
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="secondary-action"
              type="button"
              onClick={onToggleCreate}
            >
              취소
            </button>
            <button
              className="primary-action"
              type="submit"
              disabled={submitting}
            >
              {submitting ? '등록 중…' : '프로젝트 만들기'}
            </button>
          </div>
        </form>
      )}

      <div className="project-toolbar">
        <label className="search-field">
          <Search aria-hidden="true" />
          <span className="sr-only">프로젝트 검색</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="프로젝트명·발주처 검색"
          />
        </label>
        <div className="project-count">
          <strong>{visibleProjects.length}</strong>개 표시
        </div>
      </div>

      {loadState === 'ready' && projects.length === 0 ? (
        <div className="empty-projects">
          <div className="empty-graphic" aria-hidden="true">
            <FileSpreadsheet />
            <span />
            <FileCheck2 />
          </div>
          <div>
            <h2>첫 검수 프로젝트를 등록하세요</h2>
            <p>
              프로젝트를 만든 다음 별도 화면에서 산출서와 집계표를 등록합니다.
            </p>
          </div>
          <button
            className="primary-action"
            type="button"
            onClick={onToggleCreate}
          >
            <Plus aria-hidden="true" /> 프로젝트 등록
          </button>
          <ul>
            <li>
              <Check aria-hidden="true" /> 프로젝트별 원본 격리
            </li>
            <li>
              <Check aria-hidden="true" /> 프로젝트 혼합 차단
            </li>
            <li>
              <Check aria-hidden="true" /> 검수 계보 기록
            </li>
          </ul>
        </div>
      ) : (
        <div className="project-table-wrap">
          <table className="project-table">
            <caption className="sr-only">
              접근 가능한 검수 프로젝트 목록
            </caption>
            <thead>
              <tr>
                <th scope="col">프로젝트</th>
                <th scope="col">역할</th>
                <th scope="col">진행 검수</th>
                <th scope="col">확인 필요</th>
                <th scope="col">다음 단계</th>
              </tr>
            </thead>
            <tbody>
              {visibleProjects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <strong>{project.name}</strong>
                    <span>{project.clientName || 'ERP 연동 대기'}</span>
                  </td>
                  <td>
                    <span className="role-badge">
                      {roleLabel(project.role)}
                    </span>
                  </td>
                  <td>{project.openCaseCount}건</td>
                  <td
                    className={
                      project.needsAttentionCount > 0 ? 'attention' : ''
                    }
                  >
                    {project.needsAttentionCount}건
                  </td>
                  <td>
                    <button
                      className="row-action"
                      type="button"
                      onClick={() => onSelectAndContinue(project.id)}
                    >
                      선택하고 자료 등록 <ChevronRight aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleProjects.length === 0 && (
            <p className="no-search-result">
              검색 조건에 맞는 프로젝트가 없습니다.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function StageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading stage-heading">
      <div>
        <p>{eyebrow}</p>
        <h1 id="page-title">{title}</h1>
        <span>{description}</span>
      </div>
      {action}
    </div>
  );
}

function roleLabel(role: ProjectSummary['role']): string {
  return {
    workspace_admin: '관리자',
    project_owner: '프로젝트 책임자',
    reviewer: '검수자',
    approver: '승인자',
    viewer: '조회자',
  }[role];
}
