'use client';

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Link2Off,
  Menu,
  RefreshCcw,
  UserRound,
  X,
} from 'lucide-react';
import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  ProjectSummary,
  ReviewCaseSummary,
} from '@/lib/domain/contracts';
import { canonicalSourceFilename } from '@/lib/imports/source-filename';
import type { SourcePackageSummary } from '@/lib/ingestion/contracts';
import { ProjectDataWorkspace } from './project-data-workspace';
import { ProjectRegistrationWorkspace } from './project-registration-workspace';
import {
  ModuleWorkspace,
  studioNavigation,
  type StudioNavigationNode,
  type StudioView,
} from './review-modules';

type LoadState = 'loading' | 'ready' | 'error';
type MessageTone = 'neutral' | 'success' | 'error';

type ReviewStudioProps = {
  currentUser: { displayName: string; email: string };
  isLocalDemo?: boolean;
};

export function ReviewStudio({
  currentUser,
  isLocalDemo = false,
}: ReviewStudioProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [message, setMessage] = useState('프로젝트를 불러오는 중입니다.');
  const [messageTone, setMessageTone] = useState<MessageTone>('neutral');
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [activeView, setActiveView] = useState<StudioView>('project-register');
  const [expandedGroups, setExpandedGroups] = useState(
    () => new Set(['analysis-group', 'structure-group', 'finish-group']),
  );
  const [query, setQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [reviewCases, setReviewCases] = useState<ReviewCaseSummary[]>([]);
  const [caseState, setCaseState] = useState<LoadState>('ready');
  const [caseSubmitting, setCaseSubmitting] = useState(false);
  const [caseReloadToken, setCaseReloadToken] = useState(0);
  const [uploadCaseId, setUploadCaseId] = useState<string | null>(null);
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const uploadKeyRef = useRef<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenuButtonRef = useRef<HTMLButtonElement>(null);
  const primarySidebarRef = useRef<HTMLElement>(null);
  const mainHeadingRef = useRef<HTMLElement>(null);
  const selectedProjectIdRef = useRef<string | null>(selectedProjectId);

  const navigate = useCallback(
    (view: StudioView) => {
      setActiveView(view);
      if (mobileNav) {
        setMobileNav(false);
        window.setTimeout(() => mainHeadingRef.current?.focus(), 0);
      }
    },
    [mobileNav],
  );

  const selectProject = useCallback((projectId: string) => {
    if (selectedProjectIdRef.current !== projectId) {
      selectedProjectIdRef.current = projectId;
      setSelectedProjectId(projectId);
      setReviewCases([]);
      setCaseState('loading');
      setUploadCaseId(null);
      setSourceFiles([]);
      setUploadProgress('');
      uploadKeyRef.current = null;
    }
    setActiveView('project-data');
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/projects', { cache: 'no-store' });
      const body = (await response.json()) as
        | ApiSuccessEnvelope<ProjectSummary[]>
        | ApiErrorEnvelope;
      if (!response.ok || 'error' in body) {
        throw new Error(
          'error' in body
            ? body.error.message
            : '프로젝트를 불러오지 못했습니다.',
        );
      }
      setProjects(body.data);
      setLoadState('ready');
      setMessageTone('neutral');
      setMessage(
        body.data.length === 0
          ? '등록된 프로젝트가 없습니다.'
          : `${body.data.length}개 프로젝트를 불러왔습니다.`,
      );
    } catch (error) {
      setLoadState('error');
      setMessageTone('error');
      setMessage(
        error instanceof Error
          ? error.message
          : '프로젝트를 불러오지 못했습니다.',
      );
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void loadProjects(), 0);
    return () => window.clearTimeout(task);
  }, [loadProjects]);

  const closeMobileNavigation = useCallback(() => {
    setMobileNav(false);
    window.setTimeout(() => menuButtonRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!mobileNav) return;
    closeMenuButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMobileNavigation();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable =
        primarySidebarRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeMobileNavigation, mobileNav]);

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko-KR');
    if (!normalized) return projects;
    return projects.filter((project) =>
      [project.name, project.clientName ?? ''].some((value) =>
        value.toLocaleLowerCase('ko-KR').includes(normalized),
      ),
    );
  }, [projects, query]);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;
  const canUpload =
    selectedProject?.role === 'workspace_admin' ||
    selectedProject?.role === 'project_owner' ||
    selectedProject?.role === 'reviewer';

  useEffect(() => {
    if (!selectedProjectId) return;
    const projectId = selectedProjectId;
    const controller = new AbortController();
    const loadCases = async () => {
      setCaseState('loading');
      try {
        const response = await fetch(`/api/projects/${projectId}/cases`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = (await response.json()) as
          | ApiSuccessEnvelope<ReviewCaseSummary[]>
          | ApiErrorEnvelope;
        if (!response.ok || 'error' in body) {
          throw new Error(
            'error' in body
              ? body.error.message
              : '검수 케이스를 불러오지 못했습니다.',
          );
        }
        if (selectedProjectIdRef.current !== projectId) return;
        setReviewCases(body.data);
        setCaseState('ready');
      } catch (error) {
        if (
          controller.signal.aborted ||
          selectedProjectIdRef.current !== projectId
        )
          return;
        setReviewCases([]);
        setCaseState('error');
        setMessageTone('error');
        setMessage(
          error instanceof Error
            ? error.message
            : '검수 케이스를 불러오지 못했습니다.',
        );
      }
    };
    void loadCases();
    return () => controller.abort();
  }, [caseReloadToken, selectedProjectId]);

  async function createReviewCase(discipline: 'FIN' | 'RC') {
    if (!selectedProject) return;
    const target = selectedProject;
    setCaseSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${target.id}/cases`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: `${target.name} ${discipline === 'RC' ? '구조' : '마감'} 검수 ${reviewCases.length + 1}`,
          discipline,
        }),
      });
      const body = (await response.json()) as
        | ApiSuccessEnvelope<ReviewCaseSummary>
        | ApiErrorEnvelope;
      if (!response.ok || 'error' in body) {
        throw new Error(
          'error' in body
            ? body.error.message
            : '검수 케이스를 만들지 못했습니다.',
        );
      }
      if (selectedProjectIdRef.current === target.id) {
        setReviewCases((current) => [body.data, ...current]);
        setMessageTone('success');
        setMessage(`${body.data.name} 케이스를 만들었습니다.`);
      }
      setProjects((current) =>
        current.map((project) =>
          project.id === target.id
            ? { ...project, openCaseCount: project.openCaseCount + 1 }
            : project,
        ),
      );
    } catch (error) {
      setMessageTone('error');
      setMessage(
        error instanceof Error
          ? error.message
          : '검수 케이스를 만들지 못했습니다.',
      );
    } finally {
      setCaseSubmitting(false);
    }
  }

  function openSourceUpload(reviewCaseId: string) {
    uploadKeyRef.current = `source-package-${crypto.randomUUID()}`;
    setUploadCaseId(reviewCaseId);
    setSourceFiles([]);
    setUploadProgress('등록할 산출서와 집계표를 선택하세요.');
  }

  function closeSourceUpload() {
    if (uploading) return;
    uploadKeyRef.current = null;
    setUploadCaseId(null);
    setSourceFiles([]);
    setUploadProgress('');
  }

  async function uploadSources(
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    if (!selectedProject || !uploadCaseId || sourceFiles.length === 0) return;
    let canonicalFiles: Array<{ file: File; name: string }>;
    try {
      canonicalFiles = sourceFiles.map((file) => ({
        file,
        name: canonicalSourceFilename(file.name),
      }));
    } catch {
      setMessageTone('error');
      setMessage('파일명에 경로·제어문자 또는 허용되지 않는 문자가 있습니다.');
      return;
    }
    const duplicateNames = canonicalFiles
      .map(({ name }) => name.toLocaleLowerCase())
      .filter((name, index, names) => names.indexOf(name) !== index);
    if (duplicateNames.length > 0) {
      setMessageTone('error');
      setMessage('같은 파일명이 두 번 선택되었습니다. 파일명을 구분해 주세요.');
      return;
    }
    const idempotencyKey =
      uploadKeyRef.current ?? `source-package-${crypto.randomUUID()}`;
    uploadKeyRef.current = idempotencyKey;
    setUploading(true);
    try {
      setUploadProgress('파일 등록 공간과 감사 계보를 준비하는 중…');
      const packageResponse = await fetch(
        `/api/projects/${selectedProject.id}/cases/${uploadCaseId}/source-packages`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': idempotencyKey,
          },
          body: JSON.stringify({
            displayName: `${selectedProject.name} 산출서와 집계표`,
            files: sourceFiles.map((file) => ({
              filename: file.name,
              contentType: declaredContentType(file),
              sizeBytes: file.size,
              purpose: 'quantity_source',
            })),
          }),
        },
      );
      const packageBody = (await packageResponse.json()) as
        | ApiSuccessEnvelope<SourcePackageSummary>
        | ApiErrorEnvelope;
      if (!packageResponse.ok || 'error' in packageBody) {
        throw new Error(
          'error' in packageBody
            ? packageBody.error.message
            : '자료 등록 공간을 만들지 못했습니다.',
        );
      }
      const filesByKey = new Map(
        canonicalFiles.map(
          ({ file, name }) => [`${name}\u0000${file.size}`, file] as const,
        ),
      );
      let completed = packageBody.data.files.filter(
        (file) => file.status === 'stored',
      ).length;
      for (const intent of packageBody.data.files) {
        if (intent.status === 'stored') continue;
        const file = filesByKey.get(
          `${intent.filename}\u0000${intent.sizeBytes}`,
        );
        if (!file)
          throw new Error(`${intent.filename} 원본 파일을 다시 선택해 주세요.`);
        setUploadProgress(
          `${intent.filename} 검사·저장 중 (${completed + 1}/${sourceFiles.length})`,
        );
        const response = await fetch(`/api/uploads/${intent.uploadId}/bytes`, {
          method: 'PUT',
          headers: { 'content-type': 'application/octet-stream' },
          body: file,
        });
        const body = (await response.json()) as
          | ApiSuccessEnvelope<unknown>
          | ApiErrorEnvelope;
        if (!response.ok || 'error' in body) {
          throw new Error(
            'error' in body
              ? body.error.message
              : `${intent.filename} 파일을 저장하지 못했습니다.`,
          );
        }
        completed += 1;
      }
      setUploadProgress(`${completed}개 파일의 원본·해시·계보를 저장했습니다.`);
      setMessageTone('success');
      setMessage(
        `${completed}개 산출서와 집계표를 저장했습니다. AI 검수 엔진은 아직 실행하지 않았습니다.`,
      );
      uploadKeyRef.current = null;
      window.setTimeout(() => {
        setUploadCaseId(null);
        setSourceFiles([]);
        setUploadProgress('');
      }, 800);
    } catch (error) {
      setMessageTone('error');
      setMessage(
        error instanceof Error
          ? error.message
          : '산출서와 집계표를 저장하지 못했습니다.',
      );
      setUploadProgress(
        '중단된 파일부터 같은 등록 건으로 다시 시도할 수 있습니다.',
      );
    } finally {
      setUploading(false);
    }
  }

  async function createProject(
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          clientName: form.get('clientName'),
        }),
      });
      const body = (await response.json()) as
        | ApiSuccessEnvelope<ProjectSummary>
        | ApiErrorEnvelope;
      if (!response.ok || 'error' in body) {
        throw new Error(
          'error' in body
            ? body.error.message
            : '프로젝트를 만들지 못했습니다.',
        );
      }
      setProjects((current) => [body.data, ...current]);
      setMessage(
        `${body.data.name} 프로젝트를 만들었습니다. 다음 단계에서 자료를 등록하세요.`,
      );
      setMessageTone('success');
      setShowCreate(false);
      selectProject(body.data.id);
    } catch (error) {
      setMessageTone('error');
      setMessage(
        error instanceof Error
          ? error.message
          : '프로젝트를 만들지 못했습니다.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function toggleGroup(id: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const stage = findNavigationStage(studioNavigation, activeView);

  return (
    <div className="studio-shell" data-current-stage={stage?.tone ?? 'neutral'}>
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <aside
        ref={primarySidebarRef}
        id="primary-navigation"
        className={`primary-sidebar${mobileNav ? ' is-open' : ''}`}
        aria-label="주요 메뉴"
      >
        <div className="brand-lockup">
          <span aria-hidden="true" className="brand-logo brand-logo-stacked" />
          <span
            aria-hidden="true"
            className="brand-logo brand-logo-horizontal"
          />
          <button
            ref={closeMenuButtonRef}
            className="icon-button mobile-only"
            type="button"
            aria-label="메뉴 닫기"
            onClick={closeMobileNavigation}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="brand-description">
          <strong>CONCOST 기술본부 QC 스튜디오</strong>
          <span>QUANTITY CONTROL WORKSPACE</span>
        </div>
        <nav className="primary-nav" aria-label="QC 업무 단계">
          {studioNavigation.map((node) => (
            <NavigationNode
              key={node.id}
              node={node}
              activeView={activeView}
              expandedGroups={expandedGroups}
              onNavigate={navigate}
              onToggleGroup={toggleGroup}
              attentionCount={selectedProject?.needsAttentionCount ?? 0}
            />
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="employee-profile">
            <span className="employee-avatar" aria-hidden="true">
              <UserRound />
            </span>
            <span>
              <strong>{currentUser.displayName}</strong>
              <small>{currentUser.email}</small>
            </span>
          </div>
          <p>
            <span className="status-dot" /> 승인 계정 전용
          </p>
        </div>
      </aside>

      {mobileNav && (
        <button
          className="nav-scrim"
          type="button"
          aria-label="메뉴 닫기"
          onClick={closeMobileNavigation}
        />
      )}

      <div
        className="workspace"
        inert={mobileNav ? true : undefined}
        aria-hidden={mobileNav ? true : undefined}
      >
        {isLocalDemo && (
          <div className="demo-mode-banner" role="alert">
            <AlertTriangle aria-hidden="true" />
            <strong>로컬 검증 모드</strong>
            <span>인증을 우회한 개발 환경이며 운영 화면이 아닙니다.</span>
          </div>
        )}
        <header className="topbar">
          <button
            ref={menuButtonRef}
            className="icon-button mobile-only"
            type="button"
            aria-label="메뉴 열기"
            aria-controls="primary-navigation"
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(true)}
          >
            <Menu aria-hidden="true" />
          </button>
          <div className="topbar-title">
            <strong>CONCOST 기술본부 QC 스튜디오</strong>
            <span>물량산출 완료 후 PM·팀별 검수 워크스페이스</span>
          </div>
          <div className="stage-indicator" aria-label="현재 업무 단계">
            <span>{stage?.stage ? `${stage.stage} / 5` : '설정'}</span>
            <strong>{stage?.label ?? '프로젝트 등록'}</strong>
          </div>
          <div className="project-switcher">
            <span>
              <Link2Off aria-hidden="true" /> ERP 연동 대기
            </span>
            <label>
              <span className="sr-only">현재 프로젝트</span>
              <select
                value={selectedProjectId ?? ''}
                onChange={(event) => {
                  if (event.target.value) selectProject(event.target.value);
                  else {
                    selectedProjectIdRef.current = null;
                    setSelectedProjectId(null);
                    setReviewCases([]);
                    setActiveView('project-register');
                  }
                }}
              >
                <option value="">프로젝트 선택</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
          </div>
          <div className="topbar-actions">
            <span className="engine-state-note" id="engine-action-status">
              <AlertTriangle aria-hidden="true" /> AI 검수 미실행
            </span>
            <button
              type="button"
              disabled
              aria-describedby="engine-action-status"
            >
              <RefreshCcw aria-hidden="true" /> AI 재검수
            </button>
            <button
              type="button"
              disabled
              aria-describedby="engine-action-status"
            >
              <Download aria-hidden="true" /> Excel 다운로드
            </button>
          </div>
        </header>

        <main
          id="main-content"
          className="main-layout"
          ref={mainHeadingRef}
          tabIndex={-1}
        >
          {activeView === 'project-register' ? (
            <ProjectRegistrationWorkspace
              projects={projects}
              visibleProjects={visibleProjects}
              loadState={loadState}
              message={message}
              messageTone={messageTone}
              showCreate={showCreate}
              submitting={submitting}
              query={query}
              onQueryChange={setQuery}
              onToggleCreate={() => setShowCreate((value) => !value)}
              onRetry={() => {
                setLoadState('loading');
                setMessageTone('neutral');
                void loadProjects();
              }}
              onCreateProject={(event) => void createProject(event)}
              onSelectAndContinue={selectProject}
            />
          ) : activeView === 'project-data' ? (
            <ProjectDataWorkspace
              selectedProject={selectedProject}
              reviewCases={caseState === 'ready' ? reviewCases : []}
              caseState={caseState}
              canUpload={Boolean(canUpload)}
              caseSubmitting={caseSubmitting}
              uploadCaseId={uploadCaseId}
              sourceFiles={sourceFiles}
              uploading={uploading}
              uploadProgress={uploadProgress}
              message={message}
              messageTone={messageTone}
              onOpenRegistration={() => navigate('project-register')}
              onRetryCases={() => setCaseReloadToken((value) => value + 1)}
              onCreateCase={(discipline) => void createReviewCase(discipline)}
              onOpenUpload={openSourceUpload}
              onCloseUpload={closeSourceUpload}
              onFilesChange={setSourceFiles}
              onUpload={(event) => void uploadSources(event)}
            />
          ) : (
            <ModuleWorkspace
              view={activeView}
              selectedProject={selectedProject}
              reviewCases={caseState === 'ready' ? reviewCases : []}
              onOpenProjects={() => navigate('project-register')}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function NavigationNode({
  node,
  activeView,
  expandedGroups,
  onNavigate,
  onToggleGroup,
  attentionCount,
  depth = 0,
}: {
  node: StudioNavigationNode;
  activeView: StudioView;
  expandedGroups: Set<string>;
  onNavigate: (view: StudioView) => void;
  onToggleGroup: (id: string) => void;
  attentionCount: number;
  depth?: number;
}) {
  if (node.kind === 'item') {
    const active = node.id === activeView;
    return (
      <button
        className={`nav-item nav-depth-${depth}${active ? ' is-active' : ''}`}
        data-tone={node.tone}
        type="button"
        aria-current={active ? 'page' : undefined}
        onClick={() => onNavigate(node.id)}
      >
        <node.icon aria-hidden="true" />
        {node.stage && <span className="nav-step-number">{node.stage}</span>}
        <span className="nav-label">{node.label}</span>
        {node.id === 'formula-ai' && attentionCount > 0 && (
          <small>{attentionCount}</small>
        )}
      </button>
    );
  }
  const expanded = expandedGroups.has(node.id);
  const active = navigationContains(node, activeView);
  return (
    <div
      className={`nav-group nav-depth-${depth}${active ? ' is-active' : ''}`}
      data-tone={node.tone}
    >
      <button
        className="nav-group-trigger"
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          onToggleGroup(node.id);
          if (node.defaultView) onNavigate(node.defaultView);
        }}
      >
        <node.icon aria-hidden="true" />
        {node.stage && <span className="nav-step-number">{node.stage}</span>}
        <span className="nav-label">{node.label}</span>
        <ChevronRight
          className={expanded ? 'is-expanded' : ''}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div className="nav-group-children">
          {node.children.map((child) => (
            <NavigationNode
              key={child.id}
              node={child}
              activeView={activeView}
              expandedGroups={expandedGroups}
              onNavigate={onNavigate}
              onToggleGroup={onToggleGroup}
              attentionCount={attentionCount}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function navigationContains(
  node: StudioNavigationNode,
  view: StudioView,
): boolean {
  if (node.kind === 'item') return node.id === view;
  return node.children.some((child) => navigationContains(child, view));
}

function findNavigationStage(
  nodes: readonly StudioNavigationNode[],
  view: StudioView,
): { label: string; stage: number | null; tone: string } | null {
  for (const node of nodes) {
    if (node.kind === 'item' && node.id === view)
      return { label: node.label, stage: node.stage, tone: node.tone };
    if (node.kind === 'group') {
      const found = findNavigationStage(node.children, view);
      if (found) return found;
      if (node.defaultView === view)
        return { label: node.label, stage: node.stage, tone: node.tone };
    }
  }
  return null;
}

function declaredContentType(file: File): string {
  return file.name.toLocaleLowerCase().endsWith('.xlsx')
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'text/csv';
}
