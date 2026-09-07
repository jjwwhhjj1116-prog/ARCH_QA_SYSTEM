'use client';
import { UiText, useUiText } from './ui-translation';

import {
  AlertTriangle,
  ArrowRight,
  Check,
  FileSpreadsheet,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { SyntheticEvent } from 'react';
import type { ProjectSummary, ReviewCaseSummary } from '@/lib/domain/contracts';
import type { SourcePackageSummary } from '@/lib/ingestion/contracts';
import {
  hasUsableStoredSources,
  isPendingReplacement,
} from '@/lib/ingestion/document-checklist';
import { SourceDocumentChecklist } from './source-document-checklist';
import { StageHeading } from './project-registration-workspace';

type Props = {
  selectedProject: ProjectSummary | null;
  reviewCases: ReviewCaseSummary[];
  caseState: 'loading' | 'ready' | 'error';
  canUpload: boolean;
  caseSubmitting: boolean;
  uploadCaseId: string | null;
  sourceFiles: File[];
  uploadMode: 'append' | 'replace';
  onUploadModeChange: (mode: 'append' | 'replace') => void;
  onApplyReplacement: (sourcePackage: SourcePackageSummary) => void;
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
  selectedProject,
  reviewCases,
  caseState,
  canUpload,
  caseSubmitting,
  uploadCaseId,
  sourceFiles,
  uploadMode,
  onUploadModeChange,
  onApplyReplacement,
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
  const uiText = useUiText();
  const activeCase = reviewCases.find((item) => item.id === uploadCaseId);
  const teamCases = reviewCases.filter(
    (item) =>
      item.discipline === activeCase?.discipline && item.status !== 'archived',
  );
  const hasStoredSources = sourcePackages.some(hasUsableStoredSources);
  const currentPackages = sourcePackages.filter((item) => !item.supersededBy);
  const previousPackages = sourcePackages.filter((item) => item.supersededBy);
  const replacementTargets = currentPackages.filter(
    (item) => !isPendingReplacement(item),
  );
  const continueToAiReviewAction = (
    <button
      className="next-step-action"
      type="button"
      disabled={
        !hasStoredSources || uploading || sourcePackageState !== 'ready'
      }
      title={
        !hasStoredSources
          ? uiText('원본 자료를 저장하면 다음 단계로 이동할 수 있습니다.')
          : undefined
      }
      onClick={onContinueToAiReview}
    >
      {' '}
      <UiText text="STEP 2 · AI 검수 시작" /> <ArrowRight aria-hidden="true" />
    </button>
  );
  return (
    <section
      className="project-workspace stage-workspace"
      data-stage="data"
      aria-labelledby="page-title"
    >
      <StageHeading
        eyebrow={uiText('STEP 1 / 3 · 자료 등록')}
        title={uiText('산출서와 집계표를 등록하세요')}
        description={
          selectedProject
            ? `${selectedProject.name}에 등록할 팀을 고르고 원본 자료를 업로드하세요.`
            : uiText(
                '좌측 프로젝트 목록에서 자료를 등록할 프로젝트를 선택하세요.',
              )
        }
        action={
          <button
            className="secondary-action"
            type="button"
            onClick={onOpenRegistration}
          >
            {' '}
            <UiText text="프로젝트 다시 선택" />{' '}
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

      {!selectedProject ? (
        <section className="project-data-locked" aria-live="polite">
          <FileSpreadsheet aria-hidden="true" />
          <div>
            <h2>
              <UiText text="좌측 프로젝트 목록에서 프로젝트를 선택하세요." />
            </h2>
            <p>
              <UiText text="선택 즉시 해당 프로젝트의 자료 등록 화면이 열립니다." />
            </p>
          </div>
        </section>
      ) : (
        <section
          className="selected-project selected-project-workbench"
          aria-labelledby="selected-project-title"
        >
          <header className="selected-project-boundary">
            <span className="selection-label">
              <UiText text="현재 자료 저장 대상" />
            </span>
            <h2 id="selected-project-title">{selectedProject.name}</h2>
            <p>
              {' '}
              <UiText text="아래에서 등록하는 모든 산출서와 집계표는 이 프로젝트에만 저장됩니다." />{' '}
            </p>
          </header>
          <div className="case-workbench">
            <div className="case-heading">
              <div>
                <h3>
                  <UiText text="등록할 팀 선택" />
                </h3>
                <p>
                  <UiText text="팀을 선택하면 산출서와 집계표를 바로 등록할 수 있습니다." />
                </p>
              </div>
              <fieldset className="team-selector">
                <legend className="sr-only">
                  <UiText text="등록할 팀" />
                </legend>
                <button
                  className="team-choice team-choice--finish"
                  type="button"
                  aria-pressed={activeCase?.discipline === 'FIN'}
                  disabled={
                    !canUpload ||
                    uploading ||
                    caseSubmitting ||
                    caseState !== 'ready'
                  }
                  onClick={() => onCreateCase('FIN')}
                >
                  {' '}
                  <UiText text="마감팀" />{' '}
                </button>
                <button
                  className="team-choice team-choice--structure"
                  type="button"
                  aria-pressed={activeCase?.discipline === 'RC'}
                  disabled={
                    !canUpload ||
                    uploading ||
                    caseSubmitting ||
                    caseState !== 'ready'
                  }
                  onClick={() => onCreateCase('RC')}
                >
                  {' '}
                  <UiText text="구조팀" />{' '}
                </button>
              </fieldset>
            </div>

            {caseState === 'loading' ? (
              <output className="case-empty">
                {' '}
                <UiText text="팀별 저장 내역을 불러오는 중…" />{' '}
              </output>
            ) : caseState === 'error' ? (
              <div className="case-empty case-error" role="alert">
                <span>
                  <UiText text="팀별 저장 내역을 불러오지 못했습니다." />
                </span>
                <button type="button" onClick={onRetryCases}>
                  {' '}
                  <UiText text="다시 시도" />{' '}
                </button>
              </div>
            ) : !activeCase ? (
              <p className="team-selection-hint">
                {' '}
                <UiText text="팀을 선택하면 바로 자료를 등록할 수 있습니다." />{' '}
              </p>
            ) : (
              <div className="team-storage-context">
                <span>
                  {activeCase.discipline === 'FIN'
                    ? uiText('마감팀')
                    : uiText('구조팀')}{' '}
                  <UiText text="자료 등록" />{' '}
                </span>
                <small>{caseStatusLabel(activeCase.status)}</small>
                {teamCases.length > 1 ? (
                  <div>
                    <label htmlFor="team-source-history">
                      <UiText text="이전 자료 기록" />
                    </label>
                    <select
                      id="team-source-history"
                      aria-describedby="team-source-history-note"
                      value={activeCase.id}
                      disabled={uploading || caseSubmitting}
                      onChange={(event) => onOpenUpload(event.target.value)}
                    >
                      {teamCases.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <small id="team-source-history-note">
                      {' '}
                      <UiText text="기존" /> {teamCases.length}
                      <UiText text="개 기록을 보존했습니다. 이전 파일은 해당 기록을 선택해 확인하세요." />{' '}
                    </small>
                  </div>
                ) : (
                  <small>{activeCase.name}</small>
                )}
              </div>
            )}

            {uploadCaseId && (
              <form className="source-upload-panel" onSubmit={onUpload}>
                <fieldset
                  className="next-step-panel"
                  aria-label={uiText('자료 등록 상단 작업')}
                >
                  <span className="next-step-check" aria-hidden="true">
                    {hasStoredSources ? <Check /> : <ArrowRight />}
                  </span>
                  <div>
                    <h5>
                      {hasStoredSources
                        ? uiText('저장된 자료로 AI 검수 단계로 이동하세요.')
                        : uiText(
                            '원본 자료를 저장하면 다음 단계로 이동할 수 있습니다.',
                          )}
                    </h5>
                    <p>
                      {' '}
                      <UiText text="저장에 실패했거나 미등록인 자료는 제외하고 진행합니다. 검수 전 입력 매핑이 필요하며, 근거가 없는 항목은 미평가로 표시합니다." />{' '}
                    </p>
                  </div>
                  {continueToAiReviewAction}
                  <button
                    className="primary-action"
                    type="submit"
                    disabled={
                      uploading ||
                      sourceFiles.length === 0 ||
                      sourcePackageState !== 'ready'
                    }
                  >
                    <Upload aria-hidden="true" />
                    {uploading
                      ? uiText('원본 저장 중')
                      : uiText('선택 파일 저장')}
                  </button>
                </fieldset>
                <div className="source-upload-heading">
                  <div>
                    <span className="selection-label">
                      <UiText text="프로젝트 자료" />
                    </span>
                    <h4>
                      <UiText text="산출서와 집계표 원본 등록" />
                    </h4>
                    <p>
                      {' '}
                      <UiText text="XLSX·CSV 원본을 수정하지 않고 해시와 계보를 저장합니다." />{' '}
                    </p>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={uiText('자료 등록 닫기')}
                    disabled={uploading}
                    onClick={onCloseUpload}
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
                <fieldset
                  className="source-upload-mode"
                  disabled={uploading || sourcePackageState !== 'ready'}
                >
                  <legend>
                    <UiText text="자료 등록 방식" />
                  </legend>
                  <label>
                    <input
                      type="radio"
                      name="source-upload-mode"
                      value="append"
                      checked={uploadMode === 'append'}
                      onChange={() => onUploadModeChange('append')}
                    />{' '}
                    <UiText text="추가 등록" />{' '}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="source-upload-mode"
                      value="replace"
                      disabled={replacementTargets.length === 0}
                      checked={uploadMode === 'replace'}
                      onChange={() => onUploadModeChange('replace')}
                    />{' '}
                    <UiText text="기존 자료 교체" />{' '}
                  </label>
                  <p>
                    {uploadMode === 'replace'
                      ? `현재 자료 기록의 기존 ${replacementTargets.length}묶음을 새 파일로 교체합니다. 새 파일이 모두 저장되기 전까지 기존 자료는 유지됩니다.`
                      : uiText(
                          '기존 자료를 유지하고 선택한 파일을 추가합니다.',
                        )}
                  </p>
                  {uploadMode === 'replace' && (
                    <details>
                      <summary>
                        {' '}
                        <UiText text="교체 대상 확인 ·" />{' '}
                        {replacementTargets.reduce(
                          (count, item) => count + item.files.length,
                          0,
                        )}{' '}
                        <UiText text="개 파일" />{' '}
                      </summary>
                      <ul>
                        {replacementTargets.map((item) => (
                          <li key={item.id}>
                            {item.displayName} · {item.id.slice(0, 8)}
                            <ul>
                              {item.files.map((file) => (
                                <li key={file.sourceVersionId}>
                                  {file.filename}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                      <p>
                        {' '}
                        <UiText text="다른 팀·이전 자료 기록은 변경하지 않습니다. 교체 후 이전 원본은 이력으로 보관합니다." />{' '}
                      </p>
                    </details>
                  )}
                </fieldset>
                <label className="source-file-picker">
                  <Upload aria-hidden="true" />
                  <span>
                    <strong>
                      <UiText text="산출서와 집계표 선택" />
                    </strong>
                    <small>
                      <UiText text="복수 선택 가능 · 파일당 최대 20MB" />
                    </small>
                  </span>
                  <input
                    id="source-files"
                    type="file"
                    accept=".xlsx,.csv"
                    multiple
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
                {activeCase && sourcePackageState === 'ready' && (
                  <SourceDocumentChecklist
                    discipline={activeCase.discipline}
                    files={sourceFiles}
                    packages={sourcePackages}
                  />
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
                        {' '}
                        <UiText text="저장하지 못한 파일" />{' '}
                      </strong>
                      <span>
                        {uploadFailures.length}
                        <UiText text="개" />
                      </span>
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
                      {' '}
                      <UiText text="실패 파일 다시 선택" />{' '}
                    </label>
                  </section>
                )}
                <section
                  className="source-package-history"
                  aria-labelledby="source-package-history-title"
                >
                  <div className="source-package-history-heading">
                    <div>
                      <span className="selection-label">
                        <UiText text="서버 저장 내역" />
                      </span>
                      <h5 id="source-package-history-title">
                        {' '}
                        <UiText text="등록된 자료 묶음" />{' '}
                      </h5>
                    </div>
                    {sourcePackageState === 'ready' && (
                      <span>
                        {currentPackages.length}
                        <UiText text="건" />
                      </span>
                    )}
                  </div>
                  {sourcePackageState === 'loading' ? (
                    <output aria-live="polite">
                      <UiText text="저장 내역을 확인하는 중…" />
                    </output>
                  ) : sourcePackageState === 'error' ? (
                    <div className="source-package-history-error" role="alert">
                      <span>{sourcePackageError}</span>
                      <button type="button" onClick={onRetryPackages}>
                        {' '}
                        <UiText text="저장 내역 다시 불러오기" />{' '}
                      </button>
                    </div>
                  ) : currentPackages.length === 0 ? (
                    <p>
                      <UiText text="이 팀에 저장된 산출서와 집계표가 아직 없습니다." />
                    </p>
                  ) : (
                    <ul className="source-package-list">
                      {currentPackages.map((sourcePackage) => {
                        const storedCount = sourcePackage.files.filter(
                          (file) => file.status === 'stored',
                        ).length;
                        return (
                          <li key={sourcePackage.id}>
                            <div>
                              <strong>{sourcePackage.displayName}</strong>
                              <span
                                className={`package-status ${isPendingReplacement(sourcePackage) ? 'is-pending' : packageStatusToneClass(sourcePackage.status)}`}
                              >
                                {isPendingReplacement(sourcePackage)
                                  ? uiText('교체 대기 · 기존 자료 유지')
                                  : packageStatusLabel(sourcePackage.status)}
                              </span>
                              <small>
                                {storedCount}/{sourcePackage.files.length}
                                <UiText text="개 저장" />{' '}
                                {uiText(' · 등록 시작 ')}
                                {formatRegisteredAt(sourcePackage.createdAt)}
                                {uiText(' · 묶음 ')}
                                {sourcePackage.id.slice(0, 8)}
                              </small>
                              {isPendingReplacement(sourcePackage) &&
                                storedCount === sourcePackage.files.length && (
                                  <button
                                    type="button"
                                    className="secondary-action"
                                    disabled={uploading || !canUpload}
                                    onClick={() =>
                                      onApplyReplacement(sourcePackage)
                                    }
                                  >
                                    {' '}
                                    <UiText text="교체 적용" />{' '}
                                  </button>
                                )}
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
                                    ? uiText('삭제 중…')
                                    : uiText('삭제')}
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
                {previousPackages.length > 0 && (
                  <details className="source-previous-history">
                    <summary>
                      {' '}
                      <UiText text="교체된 이전 자료 ·" />{' '}
                      {previousPackages.length}
                      <UiText text="묶음 (검수 대상 제외)" />{' '}
                    </summary>
                    <ul>
                      {previousPackages.map((item) => (
                        <li key={item.id}>
                          <strong>{item.displayName}</strong> ·{' '}
                          {formatRegisteredAt(item.createdAt)}
                          <ul>
                            {item.files.map((file) => (
                              <li key={file.sourceVersionId}>
                                {file.filename}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="form-actions">
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={uploading}
                    onClick={onCloseUpload}
                  >
                    {' '}
                    <UiText text="취소" />{' '}
                  </button>
                  <button
                    className="primary-action"
                    type="submit"
                    disabled={
                      uploading ||
                      sourceFiles.length === 0 ||
                      sourcePackageState !== 'ready'
                    }
                  >
                    {uploading
                      ? `검사·저장 중 (${uploadCompletedCount}/${sourceFiles.length})`
                      : uploadMode === 'replace'
                        ? uiText('원본 검사 후 교체')
                        : uploadStatus === 'error'
                          ? uiText('원본 검사 후 다시 저장')
                          : uiText('원본 검사 후 저장')}
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
  return (
    isPendingReplacement(sourcePackage) ||
    ['draft', 'receiving', 'blocked', 'rejected'].includes(sourcePackage.status)
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
