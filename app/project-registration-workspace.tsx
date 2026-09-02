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
  Trash2,
  X,
} from 'lucide-react';
import { type SyntheticEvent, useEffect, useRef, useState } from 'react';
import type { ProjectSummary } from '@/lib/domain/contracts';

type Props = {
  projects: ProjectSummary[];
  visibleProjects: ProjectSummary[];
  loadState: 'loading' | 'ready' | 'error';
  message: string;
  messageTone: 'neutral' | 'success' | 'error';
  showCreate: boolean;
  submitting: boolean;
  archivingProjectId: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onToggleCreate: () => void;
  onRetry: () => void;
  onCreateProject: (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => void;
  onSelectAndContinue: (projectId: string) => void;
  onArchiveProject: (
    project: ProjectSummary,
    confirmationName: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
};

export function ProjectRegistrationWorkspace({
  projects,
  visibleProjects,
  loadState,
  message,
  messageTone,
  showCreate,
  submitting,
  archivingProjectId,
  query,
  onQueryChange,
  onToggleCreate,
  onRetry,
  onCreateProject,
  onSelectAndContinue,
  onArchiveProject,
}: Props) {
  const archiveDialogRef = useRef<HTMLDialogElement>(null);
  const [archiveTarget, setArchiveTarget] = useState<ProjectSummary | null>(
    null,
  );
  const [confirmationName, setConfirmationName] = useState('');
  const [archiveError, setArchiveError] = useState('');

  useEffect(() => {
    if (archiveTarget && !archiveDialogRef.current?.open) {
      archiveDialogRef.current?.showModal();
    }
  }, [archiveTarget]);

  function closeArchiveDialog() {
    archiveDialogRef.current?.close();
    setArchiveTarget(null);
    setConfirmationName('');
    setArchiveError('');
  }

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
                <th scope="col">관리</th>
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
                  <td>
                    {(project.role === 'workspace_admin' ||
                      project.role === 'project_owner') && (
                      <button
                        className="project-archive-action"
                        type="button"
                        disabled={archivingProjectId === project.id}
                        onClick={() => setArchiveTarget(project)}
                      >
                        <Trash2 aria-hidden="true" />
                        {archivingProjectId === project.id
                          ? '보관 중…'
                          : '프로젝트 삭제'}
                      </button>
                    )}
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

      <dialog
        ref={archiveDialogRef}
        className="archive-project-dialog"
        aria-labelledby="archive-project-title"
        onCancel={(event) => {
          event.preventDefault();
          if (archiveTarget && archivingProjectId === archiveTarget.id) return;
          closeArchiveDialog();
        }}
        onClose={() => {
          setArchiveTarget(null);
          setConfirmationName('');
          setArchiveError('');
        }}
      >
        {archiveTarget && (
          <form
            method="dialog"
            onSubmit={async (event) => {
              event.preventDefault();
              if (confirmationName !== archiveTarget.name) return;
              setArchiveError('');
              const result = await onArchiveProject(
                archiveTarget,
                confirmationName,
              );
              if (result.ok) closeArchiveDialog();
              else setArchiveError(result.message);
            }}
          >
            <div className="dialog-heading">
              <div>
                <span className="panel-kicker">PROJECT ARCHIVE</span>
                <h2 id="archive-project-title">
                  프로젝트를 목록에서 삭제할까요?
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="프로젝트 삭제 창 닫기"
                disabled={archivingProjectId === archiveTarget.id}
                onClick={closeArchiveDialog}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <p>
              원본 자료와 검수 이력은 지우지 않고 안전하게 보관합니다.
              계속하려면 아래에 <strong>{archiveTarget.name}</strong>을 정확히
              입력하세요.
            </p>
            <label>
              프로젝트명 확인
              <input
                autoFocus
                value={confirmationName}
                onChange={(event) => setConfirmationName(event.target.value)}
                placeholder={archiveTarget.name}
              />
            </label>
            {archiveError && (
              <p className="archive-project-error" role="alert">
                <AlertTriangle aria-hidden="true" /> {archiveError}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary-action"
                disabled={archivingProjectId === archiveTarget.id}
                onClick={closeArchiveDialog}
              >
                취소
              </button>
              <button
                type="submit"
                className="danger-action"
                disabled={
                  confirmationName !== archiveTarget.name ||
                  archivingProjectId === archiveTarget.id
                }
              >
                <Trash2 aria-hidden="true" />
                {archivingProjectId === archiveTarget.id
                  ? '프로젝트 삭제 중…'
                  : '프로젝트 삭제'}
              </button>
            </div>
          </form>
        )}
      </dialog>
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
