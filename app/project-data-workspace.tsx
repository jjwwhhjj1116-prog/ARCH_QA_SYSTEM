'use client';

import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { type SyntheticEvent, useMemo, useState } from 'react';
import type { ProjectSummary, ReviewCaseSummary } from '@/lib/domain/contracts';
import type { SourcePackageSummary } from '@/lib/ingestion/contracts';
import { StageHeading } from './project-registration-workspace';

type Props = {
  projects: ProjectSummary[];
  selectedProject: ProjectSummary | null;
  reviewCases: ReviewCaseSummary[];
  caseState: 'loading' | 'ready' | 'error';
  canUpload: boolean;
  caseSubmitting: boolean;
  uploadCaseId: string | null;
  sourceFiles: File[];
  uploading: boolean;
  uploadProgress: string;
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error';
  uploadCompletedCount: number;
  uploadFailures: Array<{
    filename: string;
    code: string;
    message: string;
    requestId?: string;
  }>;
  sourcePackages: SourcePackageSummary[];
  sourcePackageState: 'loading' | 'ready' | 'error';
  sourcePackageError: string;
  deletingSourcePackageId: string | null;
  message: string;
  messageTone: 'neutral' | 'success' | 'error';
  onOpenRegistration: () => void;
  onConfirmProject: (projectId: string) => void;
  onRetryCases: () => void;
  onCreateCase: (discipline: 'FIN' | 'RC') => void;
  onOpenUpload: (caseId: string) => void;
  onCloseUpload: () => void;
  onFilesChange: (files: File[]) => void;
  onRetryPackages: () => void;
  onArchiveSourcePackage: (sourcePackage: SourcePackageSummary) => void;
  onContinueToAiReview: () => void;
  onUpload: (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => void;
};

export function ProjectDataWorkspace({
  projects,
  selectedProject,
  reviewCases,
  caseState,
  canUpload,
  caseSubmitting,
  uploadCaseId,
  sourceFiles,
  uploading,
  uploadProgress,
  uploadStatus,
  uploadCompletedCount,
  uploadFailures,
  sourcePackages,
  sourcePackageState,
  sourcePackageError,
  deletingSourcePackageId,
  message,
  messageTone,
  onOpenRegistration,
  onConfirmProject,
  onRetryCases,
  onCreateCase,
  onOpenUpload,
  onCloseUpload,
  onFilesChange,
  onRetryPackages,
  onArchiveSourcePackage,
  onContinueToAiReview,
  onUpload,
}: Props) {
  const [candidateProjectId, setCandidateProjectId] = useState(
    selectedProject?.id ?? '',
  );
  const projectChangePending = Boolean(
    selectedProject &&
    candidateProjectId &&
    candidateProjectId !== selectedProject.id,
  );

  return (
    <section
      className="project-workspace stage-workspace"
      data-stage="data"
      aria-labelledby="page-title"
    >
      <StageHeading
        eyebrow="STEP 1 / 3 · 자료 등록"
        title="산출서와 집계표를 등록하세요"
        description={
          selectedProject
            ? `${selectedProject.name} 전용 검수 케이스와 원본 자료만 표시합니다.`
            : '프로젝트를 검색하고 확정한 뒤 해당 프로젝트에만 원본을 등록합니다.'
        }
        action={
          <button
            className="secondary-action"
            type="button"
            onClick={onOpenRegistration}
          >
            프로젝트 다시 선택
          </button>
        }
      />

      <output className={`system-message ${messageTone}`} aria-live="polite">
        {messageTone === 'error' ? (
          <AlertTriangle aria-hidden="true" />
        ) : (
          <Check aria-hidden="true" />
        )}
        <span>{message}</span>
      </output>

      <ProjectContextSelector
        projects={projects}
        currentProject={selectedProject}
        candidateId={candidateProjectId}
        onCandidateChange={setCandidateProjectId}
        onConfirmProject={onConfirmProject}
        onOpenRegistration={onOpenRegistration}
      />

      {!selectedProject || projectChangePending ? (
        <section className="project-data-locked" aria-live="polite">
          <FileSpreadsheet aria-hidden="true" />
          <div>
            <h2>
              {projectChangePending
                ? '프로젝트 변경을 먼저 확정하세요.'
                : '프로젝트 확정 후 자료 영역이 열립니다.'}
            </h2>
            <p>
              {projectChangePending
                ? '후보를 고른 상태에서는 이전 프로젝트에 잘못 저장하지 않도록 자료 영역을 잠급니다.'
                : '위 검색 결과에서 프로젝트를 고르고 ‘이 프로젝트로 진행’을 누르세요.'}
            </p>
          </div>
        </section>
      ) : (
        <section
          className="selected-project selected-project-workbench"
          aria-labelledby="selected-project-title"
        >
          <header className="selected-project-boundary">
            <span className="selection-label">현재 자료 저장 대상</span>
            <h2 id="selected-project-title">{selectedProject.name}</h2>
            <p>
              아래에서 등록하는 모든 산출서와 집계표는 이 프로젝트에만
              저장됩니다.
            </p>
          </header>
          <div className="case-workbench">
            <div className="case-heading">
              <div>
                <span className="panel-kicker">REVIEW CASE</span>
                <h3>팀별 검수 케이스</h3>
                <p>구조팀과 마감팀 자료를 독립 계보로 관리합니다.</p>
              </div>
              <div className="case-actions">
                <button
                  className="secondary-action"
                  type="button"
                  disabled={caseSubmitting || caseState !== 'ready'}
                  onClick={() => onCreateCase('FIN')}
                >
                  <Plus aria-hidden="true" /> 마감팀
                </button>
                <button
                  className="secondary-action"
                  type="button"
                  disabled={caseSubmitting || caseState !== 'ready'}
                  onClick={() => onCreateCase('RC')}
                >
                  <Plus aria-hidden="true" /> 구조팀
                </button>
              </div>
            </div>

            {caseState === 'loading' ? (
              <output className="case-empty">검수 케이스를 불러오는 중…</output>
            ) : caseState === 'error' ? (
              <div className="case-empty case-error" role="alert">
                <span>검수 케이스를 불러오지 못했습니다.</span>
                <button type="button" onClick={onRetryCases}>
                  다시 시도
                </button>
              </div>
            ) : reviewCases.length === 0 ? (
              <div className="case-empty">
                <strong>먼저 팀별 검수 케이스를 만드세요.</strong>
                <span>
                  그 다음 각 케이스에 산출서와 집계표를 등록할 수 있습니다.
                </span>
              </div>
            ) : (
              <ul className="case-list">
                {reviewCases.map((reviewCase) => (
                  <li key={reviewCase.id}>
                    <span className="case-discipline">
                      {reviewCase.discipline === 'RC' ? '구조팀' : '마감팀'}
                    </span>
                    <span>
                      <strong>{reviewCase.name}</strong>
                      <small>{caseStatusLabel(reviewCase.status)}</small>
                    </span>
                    <button
                      type="button"
                      disabled={!canUpload || uploading}
                      onClick={() => onOpenUpload(reviewCase.id)}
                    >
                      산출서와 집계표 등록
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {uploadCaseId && (
              <form className="source-upload-panel" onSubmit={onUpload}>
                <div className="source-upload-heading">
                  <div>
                    <span className="selection-label">프로젝트 자료</span>
                    <h4>산출서와 집계표 원본 등록</h4>
                    <p>
                      XLSX·CSV 원본을 수정하지 않고 해시와 계보를 저장합니다.
                    </p>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="자료 등록 닫기"
                    disabled={uploading}
                    onClick={onCloseUpload}
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
                <label className="source-file-picker">
                  <Upload aria-hidden="true" />
                  <span>
                    <strong>산출서와 집계표 선택</strong>
                    <small>복수 선택 가능 · 파일당 최대 20MB</small>
                  </span>
                  <input
                    id="source-files"
                    type="file"
                    accept=".xlsx,.csv"
                    multiple
                    required
                    disabled={uploading}
                    onChange={(event) =>
                      onFilesChange(Array.from(event.target.files ?? []))
                    }
                  />
                </label>
                {sourceFiles.length > 0 && (
                  <ul className="source-file-list">
                    {sourceFiles.map((file) => (
                      <li key={`${file.name}-${file.size}`}>
                        <FileSpreadsheet aria-hidden="true" />
                        <span>{file.name}</span>
                        <small>{formatBytes(file.size)}</small>
                      </li>
                    ))}
                  </ul>
                )}
                <output
                  className={`source-upload-progress is-${uploadStatus}`}
                  aria-live="polite"
                  aria-busy={uploading}
                >
                  {uploadProgress}
                </output>
                {uploadFailures.length > 0 && (
                  <section
                    className="upload-failure-list"
                    aria-labelledby="upload-failure-title"
                    role="alert"
                    aria-live="assertive"
                  >
                    <div>
                      <AlertTriangle aria-hidden="true" />
                      <strong id="upload-failure-title">
                        저장하지 못한 파일
                      </strong>
                      <span>{uploadFailures.length}개</span>
                    </div>
                    <ul>
                      {uploadFailures.map((failure) => (
                        <li key={`${failure.filename}-${failure.code}`}>
                          <strong>{failure.filename}</strong>
                          <span>{failure.message}</span>
                          <small>
                            {failure.code}
                            {failure.requestId
                              ? ` · 요청 ${failure.requestId}`
                              : ''}
                          </small>
                        </li>
                      ))}
                    </ul>
                    <label className="retry-file-picker" htmlFor="source-files">
                      실패 파일 다시 선택
                    </label>
                  </section>
                )}
                <section
                  className="source-package-history"
                  aria-labelledby="source-package-history-title"
                >
                  <div className="source-package-history-heading">
                    <div>
                      <span className="selection-label">서버 저장 내역</span>
                      <h5 id="source-package-history-title">
                        등록된 자료 묶음
                      </h5>
                    </div>
                    {sourcePackageState === 'ready' && (
                      <span>{sourcePackages.length}건</span>
                    )}
                  </div>
                  {sourcePackageState === 'loading' ? (
                    <output aria-live="polite">저장 내역을 확인하는 중…</output>
                  ) : sourcePackageState === 'error' ? (
                    <div className="source-package-history-error" role="alert">
                      <span>{sourcePackageError}</span>
                      <button type="button" onClick={onRetryPackages}>
                        저장 내역 다시 불러오기
                      </button>
                    </div>
                  ) : sourcePackages.length === 0 ? (
                    <p>이 팀에 저장된 산출서와 집계표가 아직 없습니다.</p>
                  ) : (
                    <ul className="source-package-list">
                      {sourcePackages.map((sourcePackage) => {
                        const storedCount = sourcePackage.files.filter(
                          (file) => file.status === 'stored',
                        ).length;
                        return (
                          <li key={sourcePackage.id}>
                            <div>
                              <strong>{sourcePackage.displayName}</strong>
                              <span
                                className={`package-status ${packageStatusToneClass(sourcePackage.status)}`}
                              >
                                {packageStatusLabel(sourcePackage.status)}
                              </span>
                              <small>
                                {storedCount}/{sourcePackage.files.length}개
                                저장
                                {' · 등록 시작 '}
                                {formatRegisteredAt(sourcePackage.createdAt)}
                                {' · 묶음 '}
                                {sourcePackage.id.slice(0, 8)}
                              </small>
                              {canArchiveSourcePackage(sourcePackage) && (
                                <button
                                  className="source-package-delete"
                                  type="button"
                                  disabled={
                                    uploading ||
                                    deletingSourcePackageId === sourcePackage.id
                                  }
                                  onClick={() =>
                                    onArchiveSourcePackage(sourcePackage)
                                  }
                                >
                                  <Trash2 aria-hidden="true" />
                                  {deletingSourcePackageId === sourcePackage.id
                                    ? '삭제 중…'
                                    : '삭제'}
                                </button>
                              )}
                            </div>
                            <ul
                              aria-label={`${sourcePackage.displayName} 파일`}
                            >
                              {sourcePackage.files.map((file) => (
                                <li key={file.sourceVersionId}>
                                  <span>{file.filename}</span>
                                  <small
                                    className={`file-status ${uploadFileStatusToneClass(file.status, file.uploadState)}`}
                                  >
                                    {uploadFileStatusLabel(
                                      file.status,
                                      file.uploadState,
                                      file.errorCode,
                                    )}
                                  </small>
                                </li>
                              ))}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
                {sourcePackages.some(isFullyStoredPackage) && (
                  <section
                    className="next-step-panel"
                    aria-labelledby="next-step-title"
                  >
                    <span className="next-step-check" aria-hidden="true">
                      <Check />
                    </span>
                    <div>
                      <span className="selection-label">STEP 1 완료</span>
                      <h5 id="next-step-title">
                        자료 저장을 확인했습니다. AI 검수를 시작하세요.
                      </h5>
                      <p>
                        서버에서 전 파일 저장이 확인된 자료 묶음이 있습니다.
                        다음 화면에서 산출식 이상치부터 검수합니다.
                      </p>
                    </div>
                    <button
                      className="next-step-action"
                      type="button"
                      onClick={onContinueToAiReview}
                    >
                      STEP 2 · AI 검수 시작 <ArrowRight aria-hidden="true" />
                    </button>
                  </section>
                )}
                <div className="form-actions">
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={uploading}
                    onClick={onCloseUpload}
                  >
                    취소
                  </button>
                  <button
                    className="primary-action"
                    type="submit"
                    disabled={uploading || sourceFiles.length === 0}
                  >
                    {uploading
                      ? `검사·저장 중 (${uploadCompletedCount}/${sourceFiles.length})`
                      : uploadStatus === 'error'
                        ? '원본 검사 후 다시 저장'
                        : '원본 검사 후 저장'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      )}
    </section>
  );
}

function canArchiveSourcePackage(sourcePackage: SourcePackageSummary): boolean {
  return ['draft', 'receiving', 'blocked', 'rejected'].includes(
    sourcePackage.status,
  );
}

function isFullyStoredPackage(sourcePackage: SourcePackageSummary): boolean {
  return (
    sourcePackage.files.length > 0 &&
    sourcePackage.files.every((file) => file.status === 'stored')
  );
}

function ProjectContextSelector({
  projects,
  currentProject,
  candidateId,
  onCandidateChange,
  onConfirmProject,
  onOpenRegistration,
}: {
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  candidateId: string;
  onCandidateChange: (projectId: string) => void;
  onConfirmProject: (projectId: string) => void;
  onOpenRegistration: () => void;
}) {
  const [query, setQuery] = useState('');
  const matchingProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return projects.filter(
      (project) =>
        !normalized ||
        `${project.name} ${project.clientName ?? ''}`
          .toLocaleLowerCase()
          .includes(normalized),
    );
  }, [projects, query]);
  const candidates = matchingProjects.slice(0, 6);
  const candidate =
    projects.find((project) => project.id === candidateId) ?? null;
  const candidateIsCurrent = candidate?.id === currentProject?.id;

  return (
    <section
      className="project-context-panel"
      aria-labelledby="project-context-title"
    >
      <div className="project-context-heading">
        <div>
          <span className="panel-kicker">PROJECT SELECTOR · RAG STATUS</span>
          <h2 id="project-context-title">
            자료를 등록할 프로젝트를 선택하세요
          </h2>
          <p>
            이름으로 검색하거나 전체 목록에서 선택한 뒤 프로젝트 경계를
            확정하세요.
          </p>
        </div>
        <button
          className="secondary-action"
          type="button"
          onClick={onOpenRegistration}
        >
          <Plus aria-hidden="true" /> 새 프로젝트 등록
        </button>
      </div>

      <ol
        className="project-context-rag"
        aria-label="프로젝트 자료 등록 준비 단계"
      >
        <li data-state={candidate ? 'done' : 'current'}>
          {candidate ? (
            <Check aria-hidden="true" />
          ) : (
            <span className="rag-dot" aria-hidden="true" />
          )}
          <span>
            <strong>1. 프로젝트 찾기</strong>
            <small>검색 또는 전체 목록</small>
          </span>
        </li>
        <li data-state={candidate ? 'done' : 'waiting'}>
          {candidate ? (
            <Check aria-hidden="true" />
          ) : (
            <span className="rag-dot" aria-hidden="true" />
          )}
          <span>
            <strong>2. 선택 후보 확인</strong>
            <small>{candidate ? candidate.name : '선택 대기'}</small>
          </span>
        </li>
        <li
          data-state={
            candidateIsCurrent ? 'done' : candidate ? 'current' : 'waiting'
          }
        >
          {candidateIsCurrent ? (
            <Check aria-hidden="true" />
          ) : (
            <span className="rag-dot" aria-hidden="true" />
          )}
          <span>
            <strong>3. 경계 확정</strong>
            <small>
              {candidate && !candidateIsCurrent
                ? '변경 확정 대기'
                : candidateIsCurrent
                  ? '이 프로젝트에만 저장'
                  : '확정 대기'}
            </small>
          </span>
        </li>
      </ol>

      <div className="project-picker-methods">
        <section className="project-picker-method">
          <label className="project-picker-label" htmlFor="project-search">
            프로젝트 검색
          </label>
          <div className="project-context-search">
            <Search aria-hidden="true" />
            <input
              id="project-search"
              type="search"
              value={query}
              aria-controls={
                query.trim() ? 'project-search-results' : undefined
              }
              onChange={(event) => setQuery(event.target.value)}
              placeholder="프로젝트명 또는 발주처 입력"
            />
          </div>
          {query.trim() && (
            <>
              <output className="project-search-count" aria-live="polite">
                검색 결과 {matchingProjects.length}개
                {matchingProjects.length > 6 ? ' · 상위 6개 표시' : ''}
              </output>
              <div
                id="project-search-results"
                className="project-context-results"
                role="radiogroup"
                aria-label="프로젝트 검색 결과"
              >
                {candidates.map((project) => (
                  <label
                    key={project.id}
                    className={candidateId === project.id ? 'is-selected' : ''}
                  >
                    <input
                      type="radio"
                      name="project-context-search-result"
                      value={project.id}
                      checked={candidateId === project.id}
                      onChange={() => onCandidateChange(project.id)}
                    />
                    <span>
                      <strong>{project.name}</strong>
                      <small>{project.clientName || 'ERP 연동 대기'}</small>
                    </span>
                    {currentProject?.id === project.id && <em>현재 선택</em>}
                  </label>
                ))}
                {candidates.length === 0 && (
                  <p>검색 조건에 맞는 프로젝트가 없습니다.</p>
                )}
              </div>
            </>
          )}
        </section>

        <div className="project-picker-divider" aria-hidden="true">
          또는
        </div>

        <section className="project-picker-method">
          <label className="project-picker-label" htmlFor="project-dropdown">
            전체 프로젝트 목록
          </label>
          <select
            id="project-dropdown"
            className="project-context-select"
            value={candidateId}
            disabled={projects.length === 0}
            onChange={(event) => onCandidateChange(event.target.value)}
          >
            <option value="" disabled>
              프로젝트를 선택하세요
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} · {project.clientName || 'ERP 연동 대기'}
              </option>
            ))}
          </select>
          <p>등록된 전체 프로젝트를 드롭다운에서 바로 선택할 수 있습니다.</p>
        </section>

        <section className="project-candidate-summary" aria-live="polite">
          <div>
            <span>선택 후보</span>
            <strong>{candidate?.name || '아직 선택하지 않았습니다.'}</strong>
            <small>
              {candidate?.clientName ||
                (candidate ? 'ERP 연동 대기' : '검색 또는 목록에서 선택')}
            </small>
          </div>
          <button
            className="project-context-confirm"
            type="button"
            disabled={!candidate || candidateIsCurrent}
            onClick={() => candidate && onConfirmProject(candidate.id)}
          >
            {candidateIsCurrent
              ? '현재 프로젝트로 확정됨'
              : '이 프로젝트로 진행'}
            {candidateIsCurrent ? (
              <Check aria-hidden="true" />
            ) : (
              <ChevronRight aria-hidden="true" />
            )}
          </button>
        </section>
      </div>
    </section>
  );
}

function caseStatusLabel(status: ReviewCaseSummary['status']): string {
  return {
    draft: '초안',
    ready: '검수 준비',
    reviewing: '검수 중',
    needs_attention: '확인 필요',
    awaiting_approval: '승인 대기',
    approved: '승인 완료',
    archived: '보관',
  }[status];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

function packageStatusLabel(status: SourcePackageSummary['status']): string {
  return {
    draft: '등록 준비',
    receiving: '일부 저장',
    validating: '검사 중',
    stored_unverified: '원본 저장 완료',
    identity_matched: '프로젝트 확인 완료',
    blocked: '차단',
    rejected: '거부',
    aborted: '중단',
  }[status];
}

function packageStatusToneClass(
  status: SourcePackageSummary['status'],
): 'is-pending' | 'is-success' | 'is-critical' {
  if (status === 'stored_unverified' || status === 'identity_matched') {
    return 'is-success';
  }
  if (status === 'blocked' || status === 'rejected' || status === 'aborted') {
    return 'is-critical';
  }
  return 'is-pending';
}

function uploadFileStatusLabel(
  status: SourcePackageSummary['files'][number]['status'],
  uploadState?: SourcePackageSummary['files'][number]['uploadState'],
  errorCode?: string | null,
): string {
  if (uploadState === 'failed') {
    const safeCode = safeUploadErrorCode(errorCode);
    const guidance: Record<string, string> = {
      FILE_XLSX_ACTIVE_CONTENT: '실행 가능한 포함 개체 차단',
      FILE_SIZE_MISMATCH: '선택 파일 크기 불일치 · 다시 선택 필요',
      FILE_EMPTY: '빈 파일 차단',
      FILE_TOO_LARGE: '파일 용량 초과',
      FILE_SIGNATURE_MISMATCH: '파일 형식·서명 불일치',
      FILE_EXTENSION_UNSUPPORTED: '지원하지 않는 확장자',
      UPLOAD_EXPIRED: '등록 시간 만료 · 다시 등록 필요',
      FILE_STORAGE_UNAVAILABLE: '원본 저장소 일시 중단',
      INTERNAL_ERROR: '서버 저장 오류',
    };
    return `${guidance[safeCode] ?? '저장 실패'} · ${safeCode}`;
  }
  if (uploadState === 'expired') return '재등록 필요';
  return {
    upload_pending: '저장 대기',
    uploaded: '검사 대기',
    validating: '검사 중',
    stored: '저장 완료',
    rejected: '저장 거부',
    deleted: '삭제됨',
  }[status];
}

function safeUploadErrorCode(value?: string | null): string {
  const normalized = value?.trim() ?? '';
  return /^[A-Z][A-Z0-9_]{1,47}$/u.test(normalized)
    ? normalized
    : 'UNKNOWN_ERROR';
}

function uploadFileStatusToneClass(
  status: SourcePackageSummary['files'][number]['status'],
  uploadState?: SourcePackageSummary['files'][number]['uploadState'],
): 'is-pending' | 'is-success' | 'is-critical' {
  if (status === 'stored') return 'is-success';
  if (
    status === 'rejected' ||
    status === 'deleted' ||
    uploadState === 'failed' ||
    uploadState === 'expired'
  )
    return 'is-critical';
  return 'is-pending';
}

function formatRegisteredAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '등록 시각 확인 불가';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}
