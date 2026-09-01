'use client';

import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronRight,
  Database,
  FileCheck2,
  FileSpreadsheet,
  FolderKanban,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
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

const workflow = [
  ['자료 등록', '산출서와 집계표'],
  ['기준 확정', '프로필·범위'],
  ['산출식 검수', 'Level A'],
  ['바닥·천장', '면적 정합성'],
  ['외벽·창호', '외피 검토'],
  ['동일 아이템', '분리 규칙 우선'],
  ['결과 확정', '검토·승인'],
] as const;

const primaryNavigation = [
  { label: '검수 프로젝트', icon: FolderKanban, active: true },
  { label: '자료 라이브러리', icon: FileSpreadsheet, active: false },
  { label: '검수 결과', icon: FileCheck2, active: false },
  { label: '규칙 프로필', icon: ShieldCheck, active: false },
  { label: '통계·리포트', icon: BarChart3, active: false },
] as const;

type LoadState = 'loading' | 'ready' | 'error';
type MessageTone = 'neutral' | 'success' | 'error';

export function ReviewStudio() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [message, setMessage] = useState('프로젝트를 불러오는 중입니다.');
  const [messageTone, setMessageTone] = useState<MessageTone>('neutral');
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [reviewCases, setReviewCases] = useState<ReviewCaseSummary[]>([]);
  const [caseState, setCaseState] = useState<LoadState>('ready');
  const [caseSubmitting, setCaseSubmitting] = useState(false);
  const [caseReloadToken, setCaseReloadToken] = useState(0);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenuButtonRef = useRef<HTMLButtonElement>(null);
  const primarySidebarRef = useRef<HTMLElement>(null);
  const selectedProjectIdRef = useRef<string | null>(selectedProjectId);

  const selectProject = useCallback((projectId: string) => {
    selectedProjectIdRef.current = projectId;
    setSelectedProjectId(projectId);
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/projects', { cache: 'no-store' });
      const body = (await response.json()) as
        | ApiSuccessEnvelope<ProjectSummary[]>
        | ApiErrorEnvelope;
      if (!response.ok || 'error' in body)
        throw new Error(
          'error' in body
            ? body.error.message
            : '프로젝트를 불러오지 못했습니다.',
        );
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
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
      if (!focusable || focusable.length === 0) return;
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
      [project.code, project.name, project.clientName ?? ''].some((value) =>
        value.toLocaleLowerCase('ko-KR').includes(normalized),
      ),
    );
  }, [projects, query]);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;

  useEffect(() => {
    if (!selectedProjectId) return;
    const projectId = selectedProjectId;
    const controller = new AbortController();
    const loadCases = async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
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
        if (controller.signal.aborted) return;
        if (selectedProjectIdRef.current !== projectId) return;
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
    return () => {
      controller.abort();
    };
  }, [caseReloadToken, selectedProjectId]);

  async function createReviewCase(discipline: 'FIN' | 'RC') {
    if (!selectedProject) return;
    const targetProject = selectedProject;
    setCaseSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${targetProject.id}/cases`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: `${targetProject.name} ${discipline} 검수 ${reviewCases.length + 1}`,
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
      if (selectedProjectIdRef.current === targetProject.id) {
        setReviewCases((current) => [body.data, ...current]);
      }
      setProjects((current) =>
        current.map((project) =>
          project.id === targetProject.id
            ? { ...project, openCaseCount: project.openCaseCount + 1 }
            : project,
        ),
      );
      if (selectedProjectIdRef.current === targetProject.id) {
        setMessageTone('success');
        setMessage(`${body.data.name} 케이스를 만들었습니다.`);
      }
    } catch (error) {
      if (selectedProjectIdRef.current === targetProject.id) {
        setMessageTone('error');
        setMessage(
          error instanceof Error
            ? error.message
            : '검수 케이스를 만들지 못했습니다.',
        );
      }
    } finally {
      setCaseSubmitting(false);
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
          code: form.get('code'),
          name: form.get('name'),
          clientName: form.get('clientName'),
        }),
      });
      const body = (await response.json()) as
        | ApiSuccessEnvelope<ProjectSummary>
        | ApiErrorEnvelope;
      if (!response.ok || 'error' in body)
        throw new Error(
          'error' in body
            ? body.error.message
            : '프로젝트를 만들지 못했습니다.',
        );
      setProjects((current) => [body.data, ...current]);
      selectProject(body.data.id);
      setMessage(`${body.data.name} 프로젝트를 만들었습니다.`);
      setMessageTone('success');
      setShowCreate(false);
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

  return (
    <div className="studio-shell">
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
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <div>
            <strong>CON COST</strong>
            <span>Review Studio</span>
          </div>
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
        <p className="brand-description">건축 물량 검수 시스템</p>
        <nav className="primary-nav">
          {primaryNavigation.map((item) => (
            <button
              key={item.label}
              className={item.active ? 'nav-item is-active' : 'nav-item'}
              type="button"
              aria-current={item.active ? 'page' : undefined}
              disabled={!item.active}
            >
              <item.icon aria-hidden="true" />
              <span>{item.label}</span>
              {!item.active && <small>준비 중</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="nav-item" type="button" disabled>
            <Settings aria-hidden="true" />
            <span>설정</span>
            <small>준비 중</small>
          </button>
          <p>
            <span className="status-dot" /> 로컬 검증 모드
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

      <div className="workspace">
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
          <div>
            <strong>FIN & RC Review Studio</strong>
            <span>원본 계보와 검수 근거를 분리해 확인합니다</span>
          </div>
          <div className="topbar-status">
            <span className="status-dot" /> AI 비활성 · 결정론 검수 우선
          </div>
        </header>

        <main id="main-content" className="main-layout">
          <section className="workflow-rail" aria-labelledby="workflow-title">
            <div className="section-heading">
              <h2 id="workflow-title">검수 워크플로</h2>
              <span>7단계</span>
            </div>
            <ol>
              {workflow.map((step, index) => (
                <li key={step[0]} className={index === 0 ? 'is-current' : ''}>
                  <span className="step-number">{index + 1}</span>
                  <span>
                    <strong>{step[0]}</strong>
                    <small>{step[1]}</small>
                  </span>
                </li>
              ))}
            </ol>
            <div className="hard-rule-note">
              <ShieldCheck aria-hidden="true" />
              <p>
                <strong>시스템 하드룰</strong>
                <span>
                  부위가 다르면 동일 아이템으로 묶지 않으며 조적은 검수 계산에서
                  제외합니다.
                </span>
              </p>
            </div>
          </section>

          <section className="project-workspace" aria-labelledby="page-title">
            <div className="page-heading">
              <div>
                <p>검수 업무 시작점</p>
                <h1 id="page-title">검수 프로젝트</h1>
                <span>
                  프로젝트를 선택하거나 새 검수를 시작하세요. 자료는 프로젝트
                  경계 밖으로 섞이지 않습니다.
                </span>
              </div>
              <button
                className="primary-action"
                type="button"
                onClick={() => setShowCreate((value) => !value)}
              >
                <Plus aria-hidden="true" /> 새 프로젝트
              </button>
            </div>

            <output
              className={`system-message ${messageTone}`}
              aria-live="polite"
            >
              {messageTone === 'error' ? (
                <AlertTriangle aria-hidden="true" />
              ) : (
                <Database aria-hidden="true" />
              )}
              <span>{message}</span>
              {loadState === 'error' && (
                <button
                  type="button"
                  onClick={() => {
                    setLoadState('loading');
                    setMessageTone('neutral');
                    void loadProjects();
                  }}
                >
                  다시 시도
                </button>
              )}
            </output>

            {showCreate && (
              <form
                className="create-project-panel"
                onSubmit={(event) => void createProject(event)}
              >
                <div className="form-heading">
                  <div>
                    <h2>새 프로젝트 등록</h2>
                    <p>
                      프로젝트 코드는 공백 제거·대문자 정규화 후 고정됩니다.
                    </p>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="등록 화면 닫기"
                    onClick={() => setShowCreate(false)}
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
                <div className="form-grid">
                  <label>
                    프로젝트 코드
                    <input
                      name="code"
                      required
                      minLength={2}
                      maxLength={40}
                      placeholder="예: F250218C1"
                      autoComplete="off"
                    />
                  </label>
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
                    onClick={() => setShowCreate(false)}
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
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="코드·프로젝트명·고객사 검색"
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
                    프로젝트를 만든 다음 산출서와 집계표를 함께 등록하면
                    양식·프로젝트·중복 여부부터 확인합니다.
                  </p>
                </div>
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus aria-hidden="true" /> 프로젝트 등록
                </button>
                <ul>
                  <li>
                    <Check aria-hidden="true" /> 원본 파일 무수정
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
                      <th scope="col">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProjects.map((project) => (
                      <tr key={project.id}>
                        <td>
                          <strong>{project.name}</strong>
                          <span>
                            {project.code}
                            {project.clientName
                              ? ` · ${project.clientName}`
                              : ''}
                          </span>
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
                            onClick={() => selectProject(project.id)}
                          >
                            검수 열기 <ChevronRight aria-hidden="true" />
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

            {selectedProject && (
              <section
                className="selected-project"
                aria-labelledby="selected-project-title"
              >
                <div>
                  <span className="selection-label">선택한 프로젝트</span>
                  <h2 id="selected-project-title">{selectedProject.name}</h2>
                  <p>
                    {selectedProject.code}
                    {selectedProject.clientName
                      ? ` · ${selectedProject.clientName}`
                      : ''}
                  </p>
                </div>
                <ol>
                  <li className="is-complete">
                    <Check aria-hidden="true" />
                    <span>
                      <strong>프로젝트 경계</strong>
                      <small>별도 프로젝트 ID와 소유자 멤버십 확보</small>
                    </span>
                  </li>
                  <li className="is-complete">
                    <Check aria-hidden="true" />
                    <span>
                      <strong>감사 시작점</strong>
                      <small>생성 actor·request ID 기록 완료</small>
                    </span>
                  </li>
                  <li>
                    <Database aria-hidden="true" />
                    <span>
                      <strong>원본 저장소 연결</strong>
                      <small>Cloudflare R2 연결 승인 대기</small>
                    </span>
                  </li>
                </ol>
                <button className="secondary-action" type="button" disabled>
                  산출서와 집계표 등록 시작
                </button>
                <div className="case-workbench">
                  <div className="case-heading">
                    <div>
                      <h3>검수 케이스</h3>
                      <p>
                        FIN과 RC를 별도 케이스로 관리해 원본 계보와 결과가
                        섞이지 않게 합니다.
                      </p>
                    </div>
                    <div className="case-actions">
                      <button
                        className="secondary-action"
                        type="button"
                        disabled={caseSubmitting}
                        onClick={() => void createReviewCase('FIN')}
                      >
                        <Plus aria-hidden="true" /> FIN 검수 추가
                      </button>
                      <button
                        className="secondary-action"
                        type="button"
                        disabled={caseSubmitting}
                        onClick={() => void createReviewCase('RC')}
                      >
                        <Plus aria-hidden="true" /> RC 검수 추가
                      </button>
                    </div>
                  </div>
                  {caseState === 'loading' ? (
                    <output className="case-empty">
                      검수 케이스를 불러오는 중…
                    </output>
                  ) : caseState === 'error' ? (
                    <div className="case-empty case-error" role="alert">
                      <span>검수 케이스를 불러오지 못했습니다.</span>
                      <button
                        type="button"
                        onClick={() => setCaseReloadToken((value) => value + 1)}
                      >
                        다시 시도
                      </button>
                    </div>
                  ) : reviewCases.length === 0 ? (
                    <p className="case-empty">
                      아직 검수 케이스가 없습니다. FIN 또는 RC 검수를
                      추가하세요.
                    </p>
                  ) : (
                    <ul className="case-list">
                      {reviewCases.map((reviewCase) => (
                        <li key={reviewCase.id}>
                          <span className="case-discipline">
                            {reviewCase.discipline}
                          </span>
                          <span>
                            <strong>{reviewCase.name}</strong>
                            <small>{caseStatusLabel(reviewCase.status)}</small>
                          </span>
                          <button type="button" disabled>
                            자료 등록 준비 중
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            <section
              className="readiness-strip"
              aria-labelledby="readiness-title"
            >
              <div>
                <h2 id="readiness-title">검수 준비 기준</h2>
                <p>자료를 올리기 전부터 차단 기준과 판정 권한을 공개합니다.</p>
              </div>
              <dl>
                <div>
                  <dt>Level A</dt>
                  <dd>계산 근거가 모두 있을 때만 결정론 오류</dd>
                </div>
                <div>
                  <dt>Level B</dt>
                  <dd>비교 집단·표본·임계값을 함께 표시</dd>
                </div>
                <div>
                  <dt>Level C</dt>
                  <dd>AI·문맥 후보, 사람 확인 전 확정 금지</dd>
                </div>
              </dl>
            </section>
          </section>
        </main>
      </div>
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
