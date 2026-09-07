'use client';
import { UiText, useUiText } from './ui-translation';

/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- The single tabindex enables keyboard scrolling of the wide project table, required by WCAG 2.1.1. */

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
  onRequestArchive: (project: ProjectSummary) => void;
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
  onRequestArchive,
}: Props) {
  const uiText = useUiText();
  return (
    <section
      className="project-workspace stage-workspace"
      data-stage="register"
      aria-labelledby="page-title"
    >
      <StageHeading
        eyebrow={uiText('PROJECT WORKSPACE · 프로젝트 관리')}
        title={uiText('검수 프로젝트를 선택하세요')}
        description={uiText(
          'ERP 그룹웨어와 동일한 프로젝트명으로 등록한 뒤, 선택한 프로젝트의 자료 등록 단계로 이동합니다.',
        )}
        action={
          <button
            className="primary-action"
            type="button"
            onClick={onToggleCreate}
          >
            <Plus aria-hidden="true" /> <UiText text="새 프로젝트 등록" />{' '}
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
            {' '}
            <UiText text="다시 시도" />{' '}
          </button>
        )}
      </output>

      {showCreate && (
        <ProjectCreationForm
          submitting={submitting}
          onCreateProject={onCreateProject}
          onToggleCreate={onToggleCreate}
        />
      )}

      <div className="project-toolbar">
        <label className="search-field">
          <Search aria-hidden="true" />
          <span className="sr-only">
            <UiText text="프로젝트 검색" />
          </span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={uiText('프로젝트명·발주처 검색')}
          />
        </label>
        <div className="project-count">
          <strong>{visibleProjects.length}</strong>
          <UiText text="개 표시" />{' '}
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
            <h2>
              <UiText text="첫 검수 프로젝트를 등록하세요" />
            </h2>
            <p>
              {' '}
              <UiText text="프로젝트를 만든 다음 별도 화면에서 산출서와 집계표를 등록합니다." />{' '}
            </p>
          </div>
          <button
            className="primary-action"
            type="button"
            onClick={onToggleCreate}
          >
            <Plus aria-hidden="true" /> <UiText text="프로젝트 등록" />{' '}
          </button>
          <ul>
            <li>
              <Check aria-hidden="true" />{' '}
              <UiText text="프로젝트별 원본 격리" />{' '}
            </li>
            <li>
              <Check aria-hidden="true" />{' '}
              <UiText text="프로젝트 혼합 차단" />{' '}
            </li>
            <li>
              <Check aria-hidden="true" /> <UiText text="검수 계보 기록" />{' '}
            </li>
          </ul>
        </div>
      ) : (
        // Keyboard users must be able to scroll the wide project table.
        <section
          className="project-table-wrap"
          tabIndex={0}
          aria-label={uiText('프로젝트 목록 표')}
        >
          <table className="project-table">
            <caption className="sr-only">
              {' '}
              <UiText text="접근 가능한 검수 프로젝트 목록" />{' '}
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <UiText text="프로젝트" />
                </th>
                <th scope="col">
                  <UiText text="역할" />
                </th>
                <th scope="col">
                  <UiText text="진행 검수" />
                </th>
                <th scope="col">
                  <UiText text="확인 필요" />
                </th>
                <th scope="col">
                  <UiText text="다음 단계" />
                </th>
                <th scope="col">
                  <UiText text="관리" />
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleProjects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <strong>{project.name}</strong>
                    <span>{project.clientName || uiText('ERP 연동 대기')}</span>
                  </td>
                  <td>
                    <span className="role-badge">
                      {roleLabel(project.role)}
                    </span>
                  </td>
                  <td>
                    {project.openCaseCount}
                    <UiText text="건" />
                  </td>
                  <td
                    className={
                      project.needsAttentionCount > 0 ? 'attention' : ''
                    }
                  >
                    {project.needsAttentionCount}
                    <UiText text="건" />{' '}
                  </td>
                  <td>
                    <button
                      className="row-action"
                      type="button"
                      onClick={() => onSelectAndContinue(project.id)}
                    >
                      {' '}
                      <UiText text="선택하고 자료 등록" />{' '}
                      <ChevronRight aria-hidden="true" />
                    </button>
                  </td>
                  <td>
                    {(project.role === 'workspace_admin' ||
                      project.role === 'project_owner') && (
                      <button
                        className="project-archive-action"
                        type="button"
                        disabled={archivingProjectId === project.id}
                        onClick={() => onRequestArchive(project)}
                      >
                        <Trash2 aria-hidden="true" />
                        {archivingProjectId === project.id
                          ? uiText('삭제 중…')
                          : uiText('삭제')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleProjects.length === 0 && (
            <p className="no-search-result">
              {' '}
              <UiText text="검색 조건에 맞는 프로젝트가 없습니다." />{' '}
            </p>
          )}
        </section>
      )}
    </section>
  );
}

export function ProjectCreationForm({
  submitting,
  onCreateProject,
  onToggleCreate,
  compact = false,
  error,
}: {
  submitting: boolean;
  onCreateProject: Props['onCreateProject'];
  onToggleCreate: () => void;
  compact?: boolean;
  error?: string;
}) {
  const uiText = useUiText();
  return (
    <form
      aria-label={uiText('새 프로젝트 등록')}
      className={`create-project-panel${compact ? ' sidebar-create-project' : ''}`}
      onSubmit={onCreateProject}
    >
      <div className="form-heading">
        <div>
          <h2>
            <UiText text="새 프로젝트 등록" />
          </h2>
          <p>
            {' '}
            <UiText text="프로젝트 코드는 입력하지 않습니다. ERP와 같은 프로젝트명을 사용하세요." />{' '}
          </p>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label={uiText('등록 화면 닫기')}
          disabled={submitting}
          onClick={onToggleCreate}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="form-grid">
        <label>
          {' '}
          <UiText text="프로젝트명" />{' '}
          <input
            name="name"
            disabled={submitting}
            required
            minLength={2}
            maxLength={120}
            placeholder={uiText('예: 덕천3구역 재건축')}
          />
        </label>
        <label>
          {' '}
          <UiText text="발주처·고객사" />{' '}
          <span>
            <UiText text="(선택)" />
          </span>
          <input
            name="clientName"
            disabled={submitting}
            maxLength={120}
            placeholder={uiText('예: 한화건설')}
          />
        </label>
      </div>
      {error && (
        <p className="archive-project-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          className="secondary-action"
          type="button"
          disabled={submitting}
          onClick={onToggleCreate}
        >
          {' '}
          <UiText text="취소" />{' '}
        </button>
        <button className="primary-action" type="submit" disabled={submitting}>
          {submitting ? uiText('등록 중…') : uiText('프로젝트 만들기')}
        </button>
      </div>
    </form>
  );
}

export function ProjectArchiveDialog({
  archiveTarget,
  archivingProjectId,
  onArchiveProject,
  onClose,
}: {
  archiveTarget: ProjectSummary;
  archivingProjectId: string | null;
  onArchiveProject: (
    project: ProjectSummary,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  onClose: () => void;
}) {
  const uiText = useUiText();
  const archiveDialogRef = useRef<HTMLDialogElement>(null);
  const [archiveError, setArchiveError] = useState('');

  useEffect(() => {
    if (archiveTarget && !archiveDialogRef.current?.open) {
      if (typeof archiveDialogRef.current?.showModal === 'function') {
        archiveDialogRef.current.showModal();
      } else {
        archiveDialogRef.current?.setAttribute('open', '');
      }
    }
  }, [archiveTarget]);

  function closeArchiveDialog() {
    if (typeof archiveDialogRef.current?.close === 'function') {
      archiveDialogRef.current.close();
    } else {
      archiveDialogRef.current?.removeAttribute('open');
    }
    onClose();
    setArchiveError('');
  }

  return (
    <dialog
      ref={archiveDialogRef}
      className="archive-project-dialog"
      aria-labelledby="archive-project-title"
      aria-describedby="archive-project-description"
      onCancel={(event) => {
        event.preventDefault();
        if (archiveTarget && archivingProjectId === archiveTarget.id) return;
        closeArchiveDialog();
      }}
      onClose={() => {
        onClose();
        setArchiveError('');
      }}
    >
      {archiveTarget && (
        <form
          method="dialog"
          onSubmit={async (event) => {
            event.preventDefault();
            setArchiveError('');
            const result = await onArchiveProject(archiveTarget);
            if (result.ok) closeArchiveDialog();
            else setArchiveError(result.message);
          }}
        >
          <div className="dialog-heading">
            <div>
              <h2 id="archive-project-title">
                {' '}
                <UiText text="프로젝트를 목록에서 삭제할까요?" />{' '}
              </h2>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label={uiText('프로젝트 삭제 창 닫기')}
              disabled={archivingProjectId === archiveTarget.id}
              onClick={closeArchiveDialog}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <p id="archive-project-description">
            <strong>{archiveTarget.name}</strong>{' '}
            <UiText text="프로젝트를 정말 삭제할까요? 목록에서는 사라지지만 원본 자료와 검수 이력은 안전하게 보관됩니다." />{' '}
          </p>
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
              {' '}
              <UiText text="취소" />{' '}
            </button>
            <button
              type="submit"
              className="danger-action"
              disabled={archivingProjectId === archiveTarget.id}
            >
              <Trash2 aria-hidden="true" />
              {archivingProjectId === archiveTarget.id
                ? uiText('삭제 중…')
                : uiText('삭제')}
            </button>
          </div>
        </form>
      )}
    </dialog>
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
