'use client';

import {
  AlertTriangle,
  Check,
  FileSpreadsheet,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import type { SyntheticEvent } from 'react';
import type { ProjectSummary, ReviewCaseSummary } from '@/lib/domain/contracts';
import type { SourcePackageSummary } from '@/lib/ingestion/contracts';
import { StageHeading } from './project-registration-workspace';

type Props = {
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
  sourcePackages: SourcePackageSummary[];
  sourcePackageState: 'loading' | 'ready' | 'error';
  sourcePackageError: string;
  message: string;
  messageTone: 'neutral' | 'success' | 'error';
  onOpenRegistration: () => void;
  onRetryCases: () => void;
  onCreateCase: (discipline: 'FIN' | 'RC') => void;
  onOpenUpload: (caseId: string) => void;
  onCloseUpload: () => void;
  onFilesChange: (files: File[]) => void;
  onRetryPackages: () => void;
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
  uploading,
  uploadProgress,
  uploadStatus,
  uploadCompletedCount,
  sourcePackages,
  sourcePackageState,
  sourcePackageError,
  message,
  messageTone,
  onOpenRegistration,
  onRetryCases,
  onCreateCase,
  onOpenUpload,
  onCloseUpload,
  onFilesChange,
  onRetryPackages,
  onUpload,
}: Props) {
  if (!selectedProject) {
    return (
      <section className="module-empty-state" data-stage="data">
        <FileSpreadsheet aria-hidden="true" />
        <div>
          <span className="panel-kicker">2 / 5 · 프로젝트 자료</span>
          <h1>프로젝트를 먼저 선택하세요</h1>
          <p>1단계에서 프로젝트를 선택한 뒤 산출서와 집계표를 등록합니다.</p>
        </div>
        <button
          className="primary-action"
          type="button"
          onClick={onOpenRegistration}
        >
          프로젝트 등록으로 이동
        </button>
      </section>
    );
  }

  return (
    <section
      className="project-workspace stage-workspace"
      data-stage="data"
      aria-labelledby="page-title"
    >
      <StageHeading
        eyebrow="2 / 5 · 프로젝트 자료"
        title="산출서와 집계표를 등록하세요"
        description={`${selectedProject.name} 전용 검수 케이스와 원본 자료만 표시합니다.`}
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

      <section
        className="selected-project"
        aria-labelledby="selected-project-title"
      >
        <div className="selected-project-summary">
          <span className="selection-label">선택한 프로젝트</span>
          <h2 id="selected-project-title">{selectedProject.name}</h2>
          <p>{selectedProject.clientName || 'ERP 연동 대기'}</p>
        </div>
        <ol className="compact-readiness">
          <li className="is-complete">
            <Check aria-hidden="true" />
            <span>
              <strong>프로젝트 경계</strong>
              <small>프로젝트 ID와 역할 확인</small>
            </span>
          </li>
          <li className="is-complete">
            <Check aria-hidden="true" />
            <span>
              <strong>원본 계보</strong>
              <small>해시·형식·압축 구조 검사</small>
            </span>
          </li>
          <li>
            <span className="step-number">3</span>
            <span>
              <strong>AI 검수</strong>
              <small>자료 등록 후 실행 가능</small>
            </span>
          </li>
        </ol>

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
                  <p>XLSX·CSV 원본을 수정하지 않고 해시와 계보를 저장합니다.</p>
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
              <section
                className="source-package-history"
                aria-labelledby="source-package-history-title"
              >
                <div className="source-package-history-heading">
                  <div>
                    <span className="selection-label">서버 저장 내역</span>
                    <h5 id="source-package-history-title">등록된 자료 묶음</h5>
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
                              {storedCount}/{sourcePackage.files.length}개 저장
                              {' · 등록 시작 '}
                              {formatRegisteredAt(sourcePackage.createdAt)}
                              {' · 묶음 '}
                              {sourcePackage.id.slice(0, 8)}
                            </small>
                          </div>
                          <ul aria-label={`${sourcePackage.displayName} 파일`}>
                            {sourcePackage.files.map((file) => (
                              <li key={file.sourceVersionId}>
                                <span>{file.filename}</span>
                                <small
                                  className={`file-status ${uploadFileStatusToneClass(file.status)}`}
                                >
                                  {uploadFileStatusLabel(file.status)}
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
): string {
  return {
    upload_pending: '저장 대기',
    uploaded: '검사 대기',
    validating: '검사 중',
    stored: '저장 완료',
    rejected: '저장 거부',
    deleted: '삭제됨',
  }[status];
}

function uploadFileStatusToneClass(
  status: SourcePackageSummary['files'][number]['status'],
): 'is-pending' | 'is-success' | 'is-critical' {
  if (status === 'stored') return 'is-success';
  if (status === 'rejected' || status === 'deleted') return 'is-critical';
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
