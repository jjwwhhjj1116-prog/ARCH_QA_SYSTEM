'use client';
import { UiText, useUiText } from './ui-translation';
import { useWorkspacePreferences } from './workspace-preferences';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type RefObject,
} from 'react';
import {
  ArrowRight,
  Check,
  Download,
  FileSearch,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import type { ProjectSummary, ReviewCaseSummary } from '@/lib/domain/contracts';
import {
  defaultProfile,
  deferredRules,
  fields,
  fieldLabels,
  type Decision,
  type Finding,
  type Inspection,
  type Mapping,
  type Profile,
  type ReviewState,
  type Run,
  type BasicJobStatus,
} from '@/lib/review/contracts';
import { columnName } from '@/lib/review/columns';
import { can } from '@/lib/domain/permissions';

const dispositionLabels = {
  needs_fix: '수정 필요',
  normal: '정상 항목',
  hold: '보류',
};
export function ReviewWorkbench({
  project,
  cases,
  initialCaseId,
  mode,
  onSources,
  onCaseChange,
  adminSettings = false,
  onSettings,
  navigationGuard,
  onNavigationGuard,
}: {
  project: ProjectSummary;
  cases: ReviewCaseSummary[];
  initialCaseId: string | null;
  mode: 'formula-ai' | 'duplicate-ai';
  onSources: () => void;
  onCaseChange: (id: string) => void;
  adminSettings?: boolean;
  onSettings?: () => void;
  navigationGuard?: RefObject<(() => boolean) | null>;
  onNavigationGuard?: (guard: (() => boolean) | null) => void;
}) {
  const finCases = cases.filter(
    (c) => c.discipline === 'FIN' && c.status !== 'archived',
  );
  const [caseId, setCaseId] = useState(
    initialCaseId && cases.some((c) => c.id === initialCaseId)
      ? initialCaseId
      : (finCases[0]?.id ?? ''),
  );
  useEffect(() => {
    if (caseId) onCaseChange(caseId);
  }, [caseId, onCaseChange]);
  if (!caseId || cases.find((c) => c.id === caseId)?.discipline !== 'FIN')
    return (
      <section className="qc-empty">
        <h1>
          <UiText text="마감팀 자료가 필요합니다" />
        </h1>
        <p>
          {' '}
          <UiText text="구조팀 검수는 준비 중입니다. 마감팀 자료를 등록하면 구조 확인과 검수를 시작할 수 있습니다." />{' '}
        </p>
        <button onClick={onSources}>
          <UiText text="자료 등록으로 돌아가기" />
        </button>
        {finCases.length > 0 && (
          <button onClick={() => setCaseId(finCases[0]!.id)}>
            {' '}
            <UiText text="마감팀 기록으로 전환" />{' '}
          </button>
        )}
      </section>
    );
  return (
    <div className="qc-workbench">
      <div className="qc-case-context">
        <strong>{project.name}</strong>
        <span>
          <UiText text="마감팀" />
        </span>
        <label>
          {' '}
          <UiText text="자료 기록" />{' '}
          <select
            value={caseId}
            onChange={(e) => {
              if (!navigationGuard?.current || navigationGuard.current())
                setCaseId(e.target.value);
            }}
          >
            {finCases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button onClick={onSources}>
          <UiText text="자료 추가·수정본 등록" />
        </button>
      </div>
      <WorkbenchCase
        key={project.id + caseId}
        project={project}
        caseId={caseId}
        mode={mode}
        adminSettings={adminSettings}
        onSettings={onSettings}
        onNavigationGuard={onNavigationGuard}
      />
    </div>
  );
}
function WorkbenchCase({
  project,
  caseId,
  mode,
  adminSettings,
  onSettings,
  onNavigationGuard,
}: {
  project: ProjectSummary;
  caseId: string;
  mode: 'formula-ai' | 'duplicate-ai';
  adminSettings: boolean;
  onSettings?: () => void;
  onNavigationGuard?: (guard: (() => boolean) | null) => void;
}) {
  const uiText = useUiText();
  const { locale } = useWorkspacePreferences();
  const date = (value: string) =>
    new Date(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'ko-KR');
  const [state, setState] = useState<ReviewState | null>(null);
  const [tab, setTab] = useState<'mapping' | 'rules' | 'results'>(
    adminSettings ? 'rules' : 'mapping',
  );
  const [busy, setBusy] = useState('');
  const [basicProgress, setBasicProgress] = useState<BasicJobStatus | null>(
    null,
  );
  const basicRequestKey = useRef<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [openingSourceId, setOpeningSourceId] = useState('');
  const [preparation, setPreparation] = useState<Record<string, string>>({});
  const [sheetName, setSheetName] = useState('');
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [profile, setProfile] = useState<Profile>({ ...defaultProfile });
  const [profileId, setProfileId] = useState('');
  const [run, setRun] = useState<Run | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<'all' | 'formula' | 'duplicate'>(
    mode === 'duplicate-ai' ? 'duplicate' : 'formula',
  );
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(100);
  const [reason, setReason] = useState('');
  const [disposition, setDisposition] =
    useState<Decision['disposition']>('needs_fix');
  const [draftScope, setDraftScope] = useState('');
  const [previousMode, setPreviousMode] = useState(mode);
  const editable = can(project.role, 'review:run');
  const canTriage = can(project.role, 'finding:triage');
  const canApprove = state?.canManageGuidelines === true;
  const endpoint = `/api/projects/${project.id}/review`;
  const request = useCallback(
    async <T,>(body?: object, runId?: string): Promise<T> => {
      const response = await fetch(
        body
          ? endpoint
          : `${endpoint}?caseId=${caseId}${runId ? `&runId=${runId}` : ''}`,
        body
          ? {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-request-id': crypto.randomUUID(),
              },
              body: JSON.stringify({ ...body, caseId }),
            }
          : { cache: 'no-store' },
      );
      const payload = (await response.json()) as {
        data?: T;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data)
        throw new Error(
          payload.error?.message ?? '서버 응답을 확인하지 못했습니다.',
        );
      return payload.data as T;
    },
    [endpoint, caseId],
  );
  const reload = useCallback(async () => {
    const data = await request<ReviewState>();
    setState(data);
    setProfileId((id) =>
      data.profiles.some((p) => p.id === id)
        ? id
        : ((adminSettings
            ? data.profiles[0]
            : data.profiles.find((p) => p.status === 'active')
          )?.id ?? ''),
    );
    return data;
  }, [request, adminSettings]);
  useEffect(() => {
    let active = true;
    request<ReviewState>()
      .then(async (data) => {
        if (active) {
          setState(data);
          const initialProfile = adminSettings
            ? data.profiles[0]
            : data.profiles.find((p) => p.status === 'active');
          setProfileId(initialProfile?.id ?? '');
          setProfile(initialProfile?.profile ?? { ...defaultProfile });
          const latest = adminSettings
            ? undefined
            : data.runs.find((r) => !r.trial);
          if (latest) {
            const saved = await request<{ run: Run; decisions: Decision[] }>(
              undefined,
              latest.id,
            );
            if (active) {
              setRun(saved.run);
              setDecisions(saved.decisions);
              setSelectedId(saved.run.findings[0]?.id ?? '');
              setTab('results');
              setNotice(
                '서버에 저장된 최근 실행을 열었습니다. 자료·지침 변경은 새 검수를 실행해야 반영됩니다.',
              );
            }
          }
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request, adminSettings]);
  async function perform(label: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청을 완료하지 못했습니다.');
    } finally {
      setBusy('');
    }
  }
  function pickSheet(data: Inspection, name: string) {
    const sheet = data.sheets.find((s) => s.name === name)!;
    setSheetName(name);
    setMapping(
      state?.mappings.find(
        (m) =>
          m.sourceVersionId === data.source.sourceVersionId && m.sheet === name,
      ) ?? sheet.suggested,
    );
  }
  function editMapping(next: Mapping) {
    setMapping({ ...next, recognition: undefined });
  }
  function inspect(sourceVersionId: string) {
    if (
      mappingDirty &&
      !window.confirm(
        uiText('저장하지 않은 열 매핑을 버리고 다른 원본을 열까요?'),
      )
    )
      return;
    void perform('원본 시트 읽는 중', async () => {
      setOpeningSourceId(sourceVersionId);
      setInspection(null);
      setMapping(null);
      setSheetName('');
      const data = await request<Inspection>({
        action: 'inspect',
        sourceVersionId,
      });
      setInspection(data);
      if (data.sheets[0]) pickSheet(data, data.sheets[0].name);
    });
  }
  function prepareSources() {
    if (
      !state ||
      (mappingDirty &&
        !window.confirm(
          uiText('저장하지 않은 열 연결 변경을 버리고 자동 확인할까요?'),
        ))
    )
      return;
    void perform('자료 자동 확인 중', async () => {
      setTab('mapping');
      const mappings = [...state.mappings];
      const results: Record<string, string> = {};
      let added = 0;
      setInspection(null);
      setMapping(null);
      setOpeningSourceId('');
      for (const [index, source] of state.sources.entries()) {
        setBusy(
          uiText('자료 확인 {current}/{total} · {filename}', {
            current: index + 1,
            total: state.sources.length,
            filename: source.filename,
          }),
        );
        try {
          const data = await request<Inspection>({
            action: 'inspect',
            sourceVersionId: source.sourceVersionId,
          });
          let ready = 0;
          for (const sheet of data.sheets) {
            const existing = mappings.findIndex(
              (m) =>
                m.sourceVersionId === source.sourceVersionId &&
                m.sheet === sheet.name,
            );
            if (existing >= 0) {
              if (mappings[existing]!.confirmed) ready++;
              continue;
            }
            if (!sheet.suggested.confirmed) continue;
            mappings.push(sheet.suggested);
            added++;
            ready++;
          }
          results[source.sourceVersionId] = data.sheets.every(
            (s) => s.suggested.kind === 'reference',
          )
            ? uiText('참고자료 · 현재 자동검수 대상 외')
            : uiText('{ready}/{total}개 시트 인식{remaining}', {
                ready,
                total: data.sheets.length,
                remaining:
                  ready < data.sheets.length
                    ? uiText(' · 나머지는 개별 확인 필요')
                    : '',
              });
        } catch (e) {
          results[source.sourceVersionId] = uiText('읽기 실패 · {error}', {
            error: uiText(
              e instanceof Error ? e.message : '다시 시도해 주세요.',
            ),
          });
        }
        setPreparation({ ...results });
      }
      if (added) {
        setBusy('인식된 자료 구조 저장 중');
        await request({
          action: 'mapping',
          mappings,
          baseVersionId: state.mappingVersionId,
        });
      }
      await reload();
      setNotice(
        added
          ? uiText(
              '{count}개 시트의 열 연결을 함께 저장했습니다. 확인이 필요한 자료는 목록에 표시했습니다. 수량의 계산 의미까지 확인한 것은 아닙니다.',
              { count: added },
            )
          : '자동 확인을 마쳤습니다. 기존 열 연결은 유지했습니다. 확인 필요·읽기 실패 자료는 아래 목록에서 확인하세요.',
      );
    });
  }
  function openRun(runId: string) {
    if (
      reason.trim() &&
      !window.confirm(
        uiText('저장하지 않은 판단 사유를 버리고 실행 이력을 바꿀까요?'),
      )
    )
      return;
    void perform('검수 근거 불러오는 중', async () => {
      const data = await request<{ run: Run; decisions: Decision[] }>(
        undefined,
        runId,
      );
      setRun(data.run);
      setDecisions(data.decisions);
      setSelectedId(data.run.findings[0]?.id ?? '');
      setReason('');
      setTab('results');
    });
  }
  function startBasicReview() {
    if (!state || busy) return;
    if (mappingDirty || profileDirty) {
      setError('편집한 열 연결·지침을 먼저 저장하거나 취소해 주세요.');
      return;
    }
    if (
      reason.trim() &&
      !window.confirm(
        uiText('저장하지 않은 판단 사유를 버리고 새 검수를 실행할까요?'),
      )
    )
      return;
    basicRequestKey.current ??= crypto.randomUUID();
    void perform('전체 자료 확인 후 기본검사 시작', async () => {
      let job =
        state.pendingJob ??
        (await request<BasicJobStatus>({
          action: 'start-basic',
          requestKey: basicRequestKey.current,
        }));
      setBasicProgress(job);
      try {
        while (job.state === 'running') {
          setBusy(
            job.stage === 'results'
              ? '검토 후보 취합·보고서 근거 저장 중'
              : uiText('자료 처리 {current}/{total} · {filename}', {
                  current: job.completedFiles,
                  total: job.totalFiles,
                  filename: job.currentFile ?? '',
                }),
          );
          const prior = job.completedFiles;
          job = await request<BasicJobStatus>({
            action: 'continue-basic',
            jobId: job.id,
          });
          setBasicProgress(job);
          if (job.state === 'running' && job.completedFiles === prior)
            await new Promise((resolve) => window.setTimeout(resolve, 1500));
        }
        if (job.state === 'failed') {
          basicRequestKey.current = null;
          throw new Error(job.error ?? '검수 실행을 마치지 못했습니다.');
        }
        const data = await request<{ run: Run; decisions: Decision[] }>(
          undefined,
          job.id,
        );
        setRun(data.run);
        setDecisions(data.decisions);
        setSelectedId(data.run.findings[0]?.id ?? '');
        setReason('');
        setTab('results');
        setNotice(
          uiText(
            '제품 기본검사 완료 · {rows}행 · 검토 후보 {findings}건. 외부 AI 사용 0토큰. 미평가 사유와 원본 근거를 확인하세요.',
            {
              rows: (
                data.run.rowCount ?? data.run.rows.length
              ).toLocaleString(),
              findings: data.run.findings.length,
            },
          ),
        );
        basicRequestKey.current = null;
      } finally {
        await reload();
      }
    });
  }
  function execute(trial: boolean) {
    if (
      reason.trim() &&
      !window.confirm(
        uiText('저장하지 않은 판단 사유를 버리고 새 검수를 실행할까요?'),
      )
    )
      return;
    if (profileDirty || mappingDirty) {
      setError(
        '편집한 지침·매핑을 먼저 저장해 주세요. 이전 값으로 실행하지 않습니다.',
      );
      return;
    }
    void perform(
      trial ? '지침 시험 검수 중' : '저장된 원본 검수 중',
      async () => {
        const data = await request<{ run: Run; decisions: Decision[] }>({
          action: 'run',
          profileId,
          trial,
        });
        setRun(data.run);
        setDecisions(data.decisions);
        setSelectedId(data.run.findings[0]?.id ?? '');
        setTab('results');
        await reload();
        setNotice(
          uiText(
            '{kind} 실행을 저장했습니다. {rows}행 · 검토 항목 {findings}건. 미평가 범위를 함께 확인하세요.',
            {
              kind: uiText(trial ? '시험' : '정식'),
              rows: data.run.rows.length.toLocaleString(),
              findings: data.run.findings.length,
            },
          ),
        );
      },
    );
  }
  const selectedProfile = state?.profiles.find((p) => p.id === profileId);
  const profileDirty =
    adminSettings &&
    !!selectedProfile &&
    JSON.stringify(profile) !== JSON.stringify(selectedProfile.profile);
  const savedMapping = state?.mappings.find(
    (m) =>
      m.sourceVersionId === mapping?.sourceVersionId &&
      m.sheet === mapping?.sheet,
  );
  const mappingDirty =
    !!mapping &&
    JSON.stringify(mapping) !==
      JSON.stringify(
        savedMapping ??
          inspection?.sheets.find((s) => s.name === mapping.sheet)?.suggested,
      );
  useEffect(() => {
    if (!onNavigationGuard) return;
    onNavigationGuard(() => {
      if (busy) return false;
      return (
        !(reason.trim() || mappingDirty || profileDirty) ||
        window.confirm(uiText('저장하지 않은 변경을 버리고 화면을 이동할까요?'))
      );
    });
    return () => {
      onNavigationGuard(null);
    };
  }, [onNavigationGuard, busy, reason, mappingDirty, profileDirty, uiText]);
  const currentSheet = inspection?.sheets.find((s) => s.name === sheetName);
  const rowsById = useMemo(
    () => new Map(run?.rows.map((r) => [r.id, r]) ?? []),
    [run],
  );
  const findings =
    run?.findings.filter(
      (f) =>
        (adminSettings ||
          (mode === 'duplicate-ai'
            ? f.ruleId === 'ITEM-018'
            : f.ruleId !== 'ITEM-018')) &&
        (filter === 'all' ||
          (filter === 'duplicate'
            ? f.ruleId === 'ITEM-018'
            : f.ruleId !== 'ITEM-018')) &&
        (!query ||
          `${f.title} ${rowsById.get(f.rowId)?.values.item}`.includes(query)),
    ) ?? [];
  const selected = findings.find((f) => f.id === selectedId) ?? findings[0];
  const currentDraftScope = `${run?.id ?? ''}/${selected?.id ?? ''}`;
  if (draftScope !== currentDraftScope) {
    setDraftScope(currentDraftScope);
    setReason('');
    setDisposition('needs_fix');
  }
  if (previousMode !== mode) {
    setPreviousMode(mode);
    setFilter(mode === 'duplicate-ai' ? 'duplicate' : 'formula');
    setQuery('');
    setReason('');
    setSelectedId('');
    setVisibleCount(100);
    setMapping(savedMapping ?? currentSheet?.suggested ?? null);
    setTab(run ? 'results' : 'mapping');
  }
  const row = selected ? rowsById.get(selected.rowId) : undefined;
  const latestDecisions = new Map(decisions.map((d) => [d.findingId, d]));
  return (
    <fieldset className="qc-workbench-controls" disabled={!!busy}>
      <header className="qc-toolbar">
        <div>
          <h1>
            {adminSettings
              ? uiText('검수 지침 관리')
              : mode === 'duplicate-ai'
                ? uiText('중복 ITEM AI 검수')
                : uiText('산출식 AI 검수')}
          </h1>
          <p>
            {adminSettings
              ? uiText(
                  '관리자 전용 · 지침 작성 → 시험 → 활성화. 일반 검수에는 승인된 지침만 적용됩니다.',
                )
              : mode === 'duplicate-ai'
                ? uiText(
                    '동별집계표의 전체 아이템을 공종에 걸쳐 비교합니다. 중복·공종 분산 후보의 원본을 확인하세요.',
                  )
                : uiText(
                    '상세 산출서의 산식과 치수를 확인합니다. 근거가 부족한 항목은 정상으로 처리하지 않습니다.',
                  )}
          </p>
        </div>
        <div className="qc-actions">
          <button
            disabled={!!busy}
            onClick={() =>
              void perform(uiText('새로 확인 중'), async () => {
                await reload();
                setNotice(uiText('서버 이력을 새로 확인했습니다.'));
              })
            }
          >
            <RefreshCw /> <UiText text="새로 확인" />{' '}
          </button>
          {!adminSettings ? (
            <>
              <button
                className="qc-primary qc-start-review"
                disabled={!editable || !!busy || !state?.sources.length}
                onClick={startBasicReview}
              >
                <Play />
                {state?.pendingJob
                  ? uiText('중단된 검수 이어서 진행')
                  : uiText('전체 자료 확인 후 검수 시작')}
              </button>
              <button
                disabled={!editable || !!busy || !state?.sources.length}
                onClick={prepareSources}
              >
                {' '}
                <UiText text="자료 자동 확인·저장" />{' '}
              </button>
              {selectedProfile?.status === 'active' && (
                <button
                  disabled={
                    !editable ||
                    !!busy ||
                    selectedProfile?.status !== 'active' ||
                    !state?.mappings.some((m) => m.confirmed)
                  }
                  onClick={() => execute(false)}
                >
                  <Play /> <UiText text="승인 지침으로 추가 검수" />{' '}
                </button>
              )}
            </>
          ) : (
            <button
              className="qc-primary"
              disabled={
                !canApprove ||
                !profileId ||
                !!busy ||
                !state?.mappings.some((m) => m.confirmed)
              }
              onClick={() => {
                if (
                  tab === 'results' &&
                  run?.trial &&
                  selectedProfile?.status === 'draft'
                )
                  setTab('rules');
                else execute(selectedProfile?.status !== 'active');
              }}
            >
              <Play />
              {tab === 'results' &&
              run?.trial &&
              selectedProfile?.status === 'draft'
                ? uiText('시험 확인 · 지침 활성화로')
                : selectedProfile?.status === 'active'
                  ? uiText('정식 검수 실행')
                  : uiText('지침 시험 실행')}
            </button>
          )}
        </div>
      </header>
      <nav
        className="qc-tabs"
        aria-label={adminSettings ? uiText('지침 관리') : uiText('검수 작업')}
      >
        {!adminSettings && (
          <button
            aria-current={tab === 'mapping' ? 'page' : undefined}
            onClick={() => setTab('mapping')}
          >
            {' '}
            <UiText text="자료 확인" />{' '}
            <span>
              {state?.mappings.filter((m) => m.confirmed).length ?? 0}
              <UiText text="개 시트" />{' '}
            </span>
          </button>
        )}
        {adminSettings && (
          <button
            aria-current={tab === 'rules' ? 'page' : undefined}
            onClick={() => setTab('rules')}
          >
            {' '}
            <UiText text="지침 설정·시험" />{' '}
            <span>
              {selectedProfile
                ? `v${selectedProfile.version} · ${selectedProfile.status === 'active' ? uiText('승인') : uiText('초안')}`
                : uiText('지침 작성')}
            </span>
          </button>
        )}
        <button
          aria-current={tab === 'results' ? 'page' : undefined}
          onClick={() => setTab('results')}
        >
          {adminSettings ? uiText('시험 결과') : uiText('결과·보고서')}{' '}
          <span>
            {run
              ? `${findings.length} · ${run.kind === 'baseline' ? uiText('제품 기본검사') : run.trial ? uiText('시험') : uiText('승인 지침 검수')}`
              : uiText('미실행')}
          </span>
        </button>
      </nav>
      {!adminSettings && state && (
        <div className="qc-preparation-guide">
          <p>
            <strong>
              {selectedProfile
                ? `적용 지침: ${selectedProfile.profile.name} · v${selectedProfile.version}`
                : uiText(
                    '상단 실행 버튼을 누르면 자료 자동 확인 → 기본검사 → 결과 저장까지 진행합니다.',
                  )}
            </strong>
          </p>
          <p>
            {' '}
            <UiText text="파일마다 열 연결을 저장할 필요가 없습니다. 표준 양식을 함께 인식하고, 계산하지 못한 산식·실패 파일·미확인 자료는 결과의 미평가 목록에 남깁니다." />{' '}
          </p>
          {!selectedProfile && (
            <p>
              {' '}
              <UiText text="제품 기본검사는 관리자 지침 승인 없이 사용할 수 있습니다. 층고·소수점 등 현장 기준 검사는 관리자가 별도 지침을 확인한 뒤 추가합니다." />{' '}
            </p>
          )}
          {canApprove && onSettings && (
            <button onClick={onSettings}>
              {' '}
              <UiText text="설정 · 검수 지침 관리" /> <ArrowRight />
            </button>
          )}
        </div>
      )}
      {busy && (
        <section
          className="qc-progress-panel"
          aria-label={uiText('검수 진행 상태')}
          aria-live="polite"
        >
          <strong>{uiText(busy)}</strong>
          {basicProgress && (
            <>
              <progress
                max={basicProgress.totalFiles}
                value={basicProgress.completedFiles}
              />
              <span>
                <UiText text="파일 처리" /> {basicProgress.completedFiles}/
                {basicProgress.totalFiles} ·{' '}
                {basicProgress.stage === 'results'
                  ? uiText('전체 후보 비교 및 결과 저장 중')
                  : uiText('완료한 파일 수 기준')}
              </span>
            </>
          )}
          <p>
            <UiText text="현재 창에서 순서대로 처리합니다. 창을 닫으면 다음 접속 시 상단 버튼으로 이어서 진행할 수 있습니다. 원본 전체를 외부 AI에 전송하지 않습니다." />
          </p>
        </section>
      )}
      {error && (
        <p className="qc-error" role="alert">
          {uiText(error)}
        </p>
      )}
      {notice && <output className="qc-success">{uiText(notice)}</output>}
      {(profileDirty || mappingDirty) && (
        <p className="qc-notice">
          {' '}
          <UiText text="저장하지 않은" />{' '}
          {profileDirty ? uiText('지침') : uiText('열 매핑')}{' '}
          <UiText text="변경이 있습니다. 저장 후 검수를 실행해 주세요." />{' '}
        </p>
      )}
      {!state ? (
        <div className="qc-empty">
          <h2>
            <UiText text="저장된 자료와 검수 이력 확인 중" />
          </h2>
          <p>
            <UiText text="서버 응답을 기다리고 있습니다." />
          </p>
        </div>
      ) : tab === 'mapping' ? (
        <div className="qc-source-layout">
          <aside className="qc-source-list">
            <h2>
              {' '}
              <UiText text="등록된 원본" /> <span>{state.sources.length}</span>
            </h2>
            <p>
              <UiText text="자동 인식 결과를 확인하거나 필요한 파일만 열어 보세요." />
            </p>
            {state.sources.map((s) => (
              <button
                key={s.sourceVersionId}
                aria-pressed={openingSourceId === s.sourceVersionId}
                disabled={!!busy}
                onClick={() => inspect(s.sourceVersionId)}
              >
                <FileSearch />
                <span>
                  <strong>{s.filename}</strong>
                  <small>
                    {preparation[s.sourceVersionId] ??
                      `${
                        state.mappings.filter(
                          (m) =>
                            m.sourceVersionId === s.sourceVersionId &&
                            m.confirmed,
                        ).length || 0
                      }개 시트 저장`}
                  </small>
                </span>
              </button>
            ))}
            {!state.sources.length && (
              <p>
                {' '}
                <UiText text="현재 기록에 서버 저장이 완료된 파일이 없습니다. 자료 등록에서 확인해 주세요." />{' '}
              </p>
            )}
          </aside>
          <section className="qc-source-editor">
            {!inspection || !mapping || !currentSheet ? (
              <div className="qc-empty">
                <FileSearch />
                <h2>
                  {openingSourceId
                    ? uiText('선택한 파일을 확인해 주세요')
                    : mode === 'duplicate-ai'
                      ? uiText('동별집계표가 중복 검수의 기준 자료입니다')
                      : uiText('산출서를 한 번에 준비하세요')}
                </h2>
                <p>
                  {openingSourceId
                    ? uiText(
                        '읽는 중이거나 읽기에 실패한 파일입니다. 이전 파일의 내용을 대신 표시하지 않습니다.',
                      )
                    : uiText(
                        '상단의 자료 자동 확인·저장으로 시작하세요. 표준 양식은 파일마다 저장할 필요가 없습니다. 직접 열 연결은 비표준 양식이나 수정할 때만 사용합니다.',
                      )}
                </p>
                <ul>
                  <li>
                    <UiText text="상세 산출서: 산식·치수·물량 검사" />
                  </li>
                  <li>
                    <UiText text="동별집계표: 전체 아이템의 중복·공종 분산 후보" />
                  </li>
                  <li>
                    <UiText text="다른 집계표·창호리스트: 후속 교차검수 자료" />
                  </li>
                </ul>
              </div>
            ) : (
              <>
                <div className="qc-section-heading">
                  <div>
                    <h2>{inspection.source.filename}</h2>
                    <p>
                      <UiText text="원본 보존 · SHA256" />{' '}
                      {inspection.sha256.slice(0, 16)}…
                    </p>
                  </div>
                  <button
                    className="qc-primary"
                    disabled={!editable || !!busy || !mapping.confirmed}
                    onClick={() =>
                      void perform(uiText('매핑 저장 중'), async () => {
                        const mappings = [
                          ...state.mappings.filter(
                            (m) =>
                              !(
                                m.sourceVersionId === mapping.sourceVersionId &&
                                m.sheet === mapping.sheet
                              ),
                          ),
                          mapping,
                        ];
                        await request({
                          action: 'mapping',
                          mappings,
                          baseVersionId: state.mappingVersionId,
                        });
                        await reload();
                        setNotice(
                          uiText(
                            '열 연결을 새 버전으로 저장했습니다. 상단에서 승인된 지침으로 검수할 수 있습니다.',
                          ),
                        );
                      })
                    }
                  >
                    <Save /> <UiText text="열 연결 저장" />{' '}
                  </button>
                </div>
                <div className="qc-form-grid">
                  <label>
                    {' '}
                    <UiText text="시트" />{' '}
                    <select
                      value={sheetName}
                      onChange={(e) => {
                        if (
                          !mappingDirty ||
                          window.confirm(
                            uiText(
                              '저장하지 않은 열 매핑을 버리고 시트를 바꿀까요?',
                            ),
                          )
                        )
                          pickSheet(inspection, e.target.value);
                      }}
                    >
                      {inspection.sheets.map((s) => (
                        <option key={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {' '}
                    <UiText text="자료 역할" />{' '}
                    <select
                      value={mapping.kind}
                      onChange={(e) =>
                        editMapping({
                          ...mapping,
                          confirmed: false,
                          kind: e.target.value as Mapping['kind'],
                        })
                      }
                    >
                      <option value="detail">
                        <UiText text="상세 산출서" />
                      </option>
                      <option value="building-summary">
                        <UiText text="동별집계표" />
                      </option>
                      <option value="reference">
                        <UiText text="참고·기준 자료" />
                      </option>
                    </select>
                  </label>
                  <label>
                    {' '}
                    <UiText text="머리글 행" />{' '}
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={mapping.headerRow}
                      onChange={(e) =>
                        editMapping({
                          ...mapping,
                          confirmed: false,
                          headerRow: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <div
                  className="qc-table-scroll"
                  aria-label={uiText('원본 시트 미리보기')}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <UiText text="원본 행" />
                        </th>
                        {Array.from(
                          {
                            length: Math.max(
                              ...currentSheet.preview.map(
                                (r) => r.cells.length,
                              ),
                              1,
                            ),
                          },
                          (_, i) => (
                            <th key={i}>{columnName(i)}</th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {currentSheet.preview.map((r) => (
                        <tr
                          key={r.number}
                          className={
                            r.number === mapping.headerRow ? 'qc-highlight' : ''
                          }
                        >
                          <th>
                            {r.number}
                            {r.hidden ? uiText(' · 숨김') : ''}
                          </th>
                          {r.cells.map((c, i) => (
                            <td key={i}>{c || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="qc-meta">
                  {' '}
                  <UiText text="전체" />{' '}
                  {currentSheet.rowCount.toLocaleString()}
                  <UiText text="행 중 미리보기" /> {currentSheet.preview.length}
                  <UiText text="행. 병합·문맥·변수의 자동 의미 추정은 하지 않습니다." />{' '}
                </p>
                <details className="qc-details">
                  <summary>
                    {' '}
                    <UiText text="열 연결 직접 수정 · 비표준 양식 또는 의미 확인이 필요할 때" />{' '}
                  </summary>
                  <div className="qc-mapping-grid">
                    {fields.map((f) => (
                      <label key={f}>
                        {uiText(fieldLabels[f])}
                        <select
                          value={mapping.columns[f] ?? ''}
                          onChange={(e) =>
                            editMapping({
                              ...mapping,
                              confirmed: false,
                              columns: {
                                ...mapping.columns,
                                [f]:
                                  e.target.value === ''
                                    ? null
                                    : Number(e.target.value),
                              },
                            })
                          }
                        >
                          <option value="">
                            <UiText text="없음 / 미확인" />
                          </option>
                          {Array.from(
                            {
                              length: Math.max(
                                ...currentSheet.preview.map(
                                  (r) => r.cells.length,
                                ),
                                1,
                              ),
                            },
                            (_, i) => (
                              <option key={i} value={i}>
                                {columnName(i)} ·{' '}
                                {currentSheet.preview.find(
                                  (r) => r.number === mapping.headerRow,
                                )?.cells[i] || uiText('이름 없음')}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                    ))}
                  </div>
                  <details className="qc-details">
                    <summary>
                      <UiText text="치수·비교집단 및 수량 계산 기준" />
                    </summary>
                    <div className="qc-form-grid">
                      <label>
                        {' '}
                        <UiText text="기재 물량의 의미" />{' '}
                        <select
                          value={mapping.arithmeticBasis}
                          onChange={(e) =>
                            editMapping({
                              ...mapping,
                              confirmed: false,
                              arithmeticBasis: e.target
                                .value as Mapping['arithmeticBasis'],
                            })
                          }
                        >
                          <option value="unknown">
                            {' '}
                            <UiText text="환산·개소 적용 단계 미확인" />{' '}
                          </option>
                          <option value="formula-result">
                            {' '}
                            <UiText text="이 열은 표시 산식의 직접 결과" />{' '}
                          </option>
                        </select>
                      </label>
                      <label>
                        {' '}
                        <UiText text="치수 열의 역할" />{' '}
                        <select
                          value={mapping.dimensionRole}
                          onChange={(e) =>
                            editMapping({
                              ...mapping,
                              confirmed: false,
                              dimensionRole: e.target
                                .value as Mapping['dimensionRole'],
                            })
                          }
                        >
                          <option value="unknown">
                            <UiText text="미확인" />
                          </option>
                          <option value="length">
                            <UiText text="길이" />
                          </option>
                          <option value="height">
                            <UiText text="높이" />
                          </option>
                          <option value="thickness">
                            <UiText text="두께" />
                          </option>
                          <option value="count">
                            <UiText text="개소" />
                          </option>
                        </select>
                      </label>
                      <label>
                        {' '}
                        <UiText text="치수 단위" />{' '}
                        <input
                          value={mapping.dimensionUnit}
                          placeholder="m / mm / EA"
                          onChange={(e) =>
                            editMapping({
                              ...mapping,
                              confirmed: false,
                              dimensionUnit: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <label className="qc-checkbox">
                      <input
                        type="checkbox"
                        checked={mapping.cohortConfirmed}
                        onChange={(e) =>
                          editMapping({
                            ...mapping,
                            confirmed: false,
                            cohortConfirmed: e.target.checked,
                          })
                        }
                      />{' '}
                      <UiText text="비교집단 열이 동일 실 유형·부위·치수 의미·산출 방식을 구분함을 확인했습니다." />{' '}
                    </label>
                  </details>
                  <label className="qc-confirm">
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={mapping.confirmed}
                      onChange={(e) =>
                        editMapping({ ...mapping, confirmed: e.target.checked })
                      }
                    />
                    {mapping.recognition
                      ? uiText(
                          '표준 FIN 머리글 자동 인식 · 치수 및 계산 의미는 별도 확인합니다.',
                        )
                      : uiText(
                          '이 시트의 머리글·열 의미·자료 역할을 원본과 대조했습니다.',
                        )}
                  </label>
                </details>
              </>
            )}
          </section>
        </div>
      ) : tab === 'rules' && adminSettings && canApprove ? (
        <section className="qc-rules">
          <div className="qc-section-heading">
            <div>
              <h2>
                <UiText text="수정 가능한 검수 지침" />
              </h2>
              <p>
                {' '}
                <UiText text="작성 → 시험 실행 → 검토 → 승인. 저장만으로 현장 기준이 바뀌지 않습니다." />{' '}
              </p>
            </div>
            <label>
              {' '}
              <UiText text="저장된 버전" />{' '}
              <select
                value={profileId}
                onChange={(e) => {
                  if (
                    profileDirty &&
                    !window.confirm(
                      uiText(
                        '저장하지 않은 지침 편집을 버리고 버전을 바꿀까요?',
                      ),
                    )
                  )
                    return;
                  setProfileId(e.target.value);
                  const p = state.profiles.find((v) => v.id === e.target.value);
                  if (p) setProfile(p.profile);
                }}
              >
                <option value="">
                  <UiText text="새 지침" />
                </option>
                {state.profiles.map((p) => (
                  <option value={p.id} key={p.id}>
                    v{p.version} ·{' '}
                    {p.status === 'active' ? uiText('승인') : uiText('초안')} ·{' '}
                    {p.profile.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="qc-guideline-grid">
            <div>
              <div className="qc-form-grid">
                <label>
                  {' '}
                  <UiText text="지침 이름" />{' '}
                  <input
                    value={profile.name}
                    onChange={(e) =>
                      setProfile({ ...profile, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  {' '}
                  <UiText text="추가·변경 사유" />{' '}
                  <input
                    value={profile.reason}
                    onChange={(e) =>
                      setProfile({ ...profile, reason: e.target.value })
                    }
                  />
                </label>
              </div>
              <fieldset>
                <legend>
                  <UiText text="실행 가능한 검사" />
                </legend>
                <label className="qc-checkbox">
                  <input
                    type="checkbox"
                    checked={profile.arithmetic}
                    onChange={(e) =>
                      setProfile({ ...profile, arithmetic: e.target.checked })
                    }
                  />{' '}
                  <UiText text="산출식 재계산 · 해석 불가 분리" />{' '}
                </label>
                <label>
                  {' '}
                  <UiText text="물량 허용오차" />{' '}
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={profile.tolerance}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        tolerance: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="qc-checkbox">
                  <input
                    type="checkbox"
                    checked={profile.decimalShift}
                    onChange={(e) =>
                      setProfile({ ...profile, decimalShift: e.target.checked })
                    }
                  />{' '}
                  <UiText text="치수 소수점 이동 패턴 · 10배/100배" />{' '}
                </label>
                <div className="qc-form-grid">
                  <label>
                    {' '}
                    <UiText text="최소 다른 표본 수" />{' '}
                    <input
                      type="number"
                      min="5"
                      max="100"
                      value={profile.minPeers}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          minPeers: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    {' '}
                    <UiText text="중앙값 대비 허용 편차 (%)" />{' '}
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={Math.round(profile.peerTolerance * 100)}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          peerTolerance: Number(e.target.value) / 100,
                        })
                      }
                    />
                  </label>
                </div>
                <label className="qc-checkbox">
                  <input
                    type="checkbox"
                    checked={profile.duplicates}
                    onChange={(e) =>
                      setProfile({ ...profile, duplicates: e.target.checked })
                    }
                  />{' '}
                  <UiText text="동별집계표 중복 코드·공종 분산 후보" />{' '}
                </label>
                <p className="qc-meta">
                  {' '}
                  <UiText text="초깃값은 업계 표준이 아닙니다. 비교집단과 물량 기준 확인 후 프로젝트 지침으로 승인하세요." />{' '}
                </p>
              </fieldset>
              <fieldset>
                <legend>
                  <UiText text="프로젝트 치수 기준" />
                </legend>
                <label className="qc-checkbox">
                  <input
                    type="checkbox"
                    checked={profile.rangeEnabled}
                    onChange={(e) =>
                      setProfile({ ...profile, rangeEnabled: e.target.checked })
                    }
                  />{' '}
                  <UiText text="명시한 치수 범위를 적용합니다" />{' '}
                </label>
                <div className="qc-form-grid">
                  <label>
                    {' '}
                    <UiText text="치수 의미" />{' '}
                    <select
                      value={profile.dimensionRole}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          dimensionRole: e.target
                            .value as Profile['dimensionRole'],
                        })
                      }
                    >
                      <option value="length">
                        <UiText text="길이" />
                      </option>
                      <option value="height">
                        <UiText text="높이" />
                      </option>
                      <option value="thickness">
                        <UiText text="두께" />
                      </option>
                      <option value="count">
                        <UiText text="개소" />
                      </option>
                    </select>
                  </label>
                  <label>
                    {' '}
                    <UiText text="단위" />{' '}
                    <input
                      value={profile.dimensionUnit}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          dimensionUnit: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    {' '}
                    <UiText text="최소" />{' '}
                    <input
                      type="number"
                      value={profile.rangeMin}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          rangeMin: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    {' '}
                    <UiText text="최대" />{' '}
                    <input
                      type="number"
                      value={profile.rangeMax}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          rangeMax: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <ConditionEditor profile={profile} onChange={setProfile} />
              </fieldset>
              <button
                className="qc-primary"
                disabled={!canApprove || !!busy}
                onClick={() =>
                  void perform(uiText('지침 초안 저장 중'), async () => {
                    const saved = await request<{ id: string }>({
                      action: 'profile',
                      profile,
                    });
                    await reload();
                    setProfileId(saved.id);
                    setNotice(
                      uiText(
                        '새 지침 버전을 저장했습니다. 상단에서 시험 실행 후 결과를 확인하세요.',
                      ),
                    );
                  })
                }
              >
                <Save />
                <UiText text="새 버전으로 초안 저장" />{' '}
              </button>
            </div>
            <aside className="qc-guide">
              <h3>
                <UiText text="현재 실행할 지침" />
              </h3>
              {selectedProfile ? (
                <>
                  <strong>
                    v{selectedProfile.version} · {selectedProfile.profile.name}
                  </strong>
                  <p>
                    {selectedProfile.status === 'active'
                      ? uiText('승인된 지침 · 정식 실행 가능')
                      : uiText('초안 · 시험 실행만 가능')}
                  </p>
                  <p>
                    <UiText text="편집 중인 값이 아니라 이 저장 버전으로 실행됩니다." />
                  </p>
                  <button
                    disabled={!!busy || !selectedProfile.trialRunId}
                    onClick={() => openRun(selectedProfile.trialRunId!)}
                  >
                    {' '}
                    <UiText text="시험 결과 확인" />{' '}
                  </button>
                  <button
                    className="qc-primary"
                    disabled={
                      !canApprove ||
                      !!busy ||
                      !selectedProfile.trialRunId ||
                      selectedProfile.status === 'active'
                    }
                    onClick={() =>
                      void perform(uiText('지침 승인 중'), async () => {
                        await request({
                          action: 'approve',
                          profileId,
                          trialRunId: selectedProfile.trialRunId,
                        });
                        await reload();
                        setNotice(
                          uiText(
                            '시험한 지침 버전을 승인했습니다. 정식 검수를 실행할 수 있습니다.',
                          ),
                        );
                      })
                    }
                  >
                    <ShieldCheck />
                    <UiText text="이 지침 버전 활성화" />{' '}
                  </button>
                </>
              ) : (
                <p>
                  <UiText text="왼쪽 설정을 초안으로 저장하면 시험할 수 있습니다." />
                </p>
              )}
              <h3>
                <UiText text="추가 자료·개발이 필요한 검사" />
              </h3>
              {deferredRules.map(([id, title, need]) => (
                <details key={id}>
                  <summary>
                    {title}{' '}
                    <span>
                      <UiText text="준비 중" />
                    </span>
                  </summary>
                  <p>{need}</p>
                </details>
              ))}
              <p>
                <UiText text="구조팀·조적·도면 대조는 현재 검수 범위에 포함하지 않습니다." />
              </p>
            </aside>
          </div>
        </section>
      ) : (
        <section className="qc-results">
          <div className="qc-section-heading">
            <div>
              <h2>
                {adminSettings
                  ? uiText('시험 결과와 원본 대조')
                  : mode === 'duplicate-ai'
                    ? uiText('중복·공종 분산 후보와 원본 대조')
                    : uiText('산출식·치수 검토와 원본 대조')}
              </h2>
              <p>
                {run
                  ? `${date(run.createdAt)} · ${run.kind === 'baseline' ? uiText('제품 기본검사') : `${uiText('지침')} v${run.profileVersion} · ${run.trial ? uiText('시험 결과 (판단 기록 불가)') : uiText('승인 지침 검수')}`} · ${run.id.slice(0, 8)}`
                  : uiText(
                      '아직 선택한 실행이 없습니다. 원본과 지침을 확인한 후 실행하세요.',
                    )}
              </p>
            </div>
            <div className="qc-actions">
              <label>
                {' '}
                <UiText text="실행 이력" />{' '}
                <select
                  value={run?.id ?? ''}
                  disabled={!!busy}
                  onChange={(e) => {
                    if (e.target.value) openRun(e.target.value);
                  }}
                >
                  <option value="">
                    <UiText text="실행 선택" />
                  </option>
                  {state.runs
                    .filter((r) => adminSettings || !r.trial)
                    .map((r) => (
                      <option value={r.id} key={r.id}>
                        {date(r.createdAt)} ·{' '}
                        {r.kind === 'baseline'
                          ? uiText('제품 기본검사')
                          : `v${r.profileVersion} · ${r.trial ? uiText('시험') : uiText('승인 지침 검수')}`}{' '}
                        · {r.findingCount}
                        <UiText text="건" />{' '}
                      </option>
                    ))}
                </select>
              </label>
              {run ? (
                <a
                  className="qc-download"
                  download
                  href={`/api/projects/${project.id}/review?caseId=${caseId}&runId=${run.id}&format=xlsx`}
                >
                  <Download /> <UiText text="Excel 보고서" />{' '}
                </a>
              ) : (
                <button disabled>
                  <Download /> <UiText text="Excel 보고서" />{' '}
                </button>
              )}
            </div>
          </div>
          {run ? (
            <>
              <div className="qc-coverage">
                {run.coverage
                  .filter(
                    (c) =>
                      adminSettings ||
                      (mode === 'duplicate-ai'
                        ? c.ruleId === 'ITEM-018'
                        : c.ruleId !== 'ITEM-018'),
                  )
                  .map((c) => (
                    <div key={c.ruleId}>
                      <strong>{uiText(c.label)}</strong>
                      <span>
                        <UiText text="평가" /> {c.evaluated.toLocaleString()}
                        <UiText text="행" />
                      </span>
                      <b>
                        <UiText text="미평가" />{' '}
                        {c.unevaluated.toLocaleString()}
                        <UiText text="행" />
                      </b>
                    </div>
                  ))}
              </div>
              <details className="qc-details">
                <summary>
                  <UiText text="미평가 사유·검수 제한 · 반드시 확인" />
                </summary>
                {run.coverage.map((c) => (
                  <p key={c.ruleId}>
                    <strong>{uiText(c.label)}:</strong>{' '}
                    {c.reasons.map((reason) => uiText(reason)).join(' / ') ||
                      uiText('미평가 사유 없음')}
                  </p>
                ))}
                {run.limitations.map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </details>
              <div className="qc-result-filters">
                {adminSettings ? (
                  <>
                    <button
                      aria-pressed={filter === 'all'}
                      onClick={() => {
                        if (
                          !reason.trim() ||
                          window.confirm(
                            uiText(
                              '저장하지 않은 판단 사유를 버리고 필터를 바꿀까요?',
                            ),
                          )
                        ) {
                          setReason('');
                          setFilter('all');
                        }
                      }}
                    >
                      {' '}
                      <UiText text="전체" /> {run.findings.length}
                    </button>
                    <button
                      aria-pressed={filter === 'formula'}
                      onClick={() => {
                        if (
                          !reason.trim() ||
                          window.confirm(
                            uiText(
                              '저장하지 않은 판단 사유를 버리고 필터를 바꿀까요?',
                            ),
                          )
                        ) {
                          setReason('');
                          setFilter('formula');
                        }
                      }}
                    >
                      {' '}
                      <UiText text="산출식·치수" />{' '}
                    </button>
                    <button
                      aria-pressed={filter === 'duplicate'}
                      onClick={() => {
                        if (
                          !reason.trim() ||
                          window.confirm(
                            uiText(
                              '저장하지 않은 판단 사유를 버리고 필터를 바꿀까요?',
                            ),
                          )
                        ) {
                          setReason('');
                          setFilter('duplicate');
                        }
                      }}
                    >
                      {' '}
                      <UiText text="중복·공종 분산" />{' '}
                    </button>
                  </>
                ) : (
                  <strong>
                    {mode === 'duplicate-ai'
                      ? uiText('중복·공종 분산 후보')
                      : uiText('산출식·치수 검토')}{' '}
                    {findings.length}
                    <UiText text="건" />{' '}
                  </strong>
                )}
                <input
                  aria-label={uiText('검토 항목 검색')}
                  placeholder={uiText('품명·검토 내용 검색')}
                  disabled={!!reason.trim()}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="qc-triage">
                <aside className="qc-findings">
                  <h3>
                    {' '}
                    <UiText text="검토할 항목" /> <span>{findings.length}</span>
                  </h3>
                  {findings.slice(0, visibleCount).map((f) => (
                    <button
                      key={f.id}
                      aria-pressed={selected?.id === f.id}
                      onClick={() => {
                        if (
                          reason.trim() &&
                          !window.confirm(
                            uiText(
                              '저장하지 않은 판단 사유를 버리고 항목을 바꿀까요?',
                            ),
                          )
                        )
                          return;
                        setSelectedId(f.id);
                        setReason('');
                      }}
                    >
                      <span className={`qc-level qc-level-${f.level}`}>
                        {f.level} ·{' '}
                        {f.severity === 'important'
                          ? uiText('중요')
                          : uiText('확인')}
                      </span>
                      <strong>{uiText(f.title)}</strong>
                      <span>{rowsById.get(f.rowId)?.values.item}</span>
                      <small>
                        {latestDecisions.get(f.id)
                          ? uiText(
                              dispositionLabels[
                                latestDecisions.get(f.id)!.disposition
                              ],
                            )
                          : uiText('미판단')}
                      </small>
                    </button>
                  ))}
                  {findings.length > visibleCount && (
                    <button onClick={() => setVisibleCount((n) => n + 100)}>
                      {' '}
                      <UiText text="다음 100건 더 보기 (" />
                      {visibleCount}/{findings.length})
                    </button>
                  )}
                  {!findings.length && (
                    <p>
                      {' '}
                      <UiText text="이 필터의 검토 후보가 없습니다. 미평가 항목까지 정상이라는 뜻은 아닙니다." />{' '}
                    </p>
                  )}
                </aside>
                <section className="qc-original">
                  <h3>
                    <UiText text="원본 행" />
                  </h3>
                  {row ? (
                    <>
                      <p>
                        {row.ref.filename}
                        <br />
                        {row.ref.sheet} · {row.ref.row}
                        <UiText text="행 ·" /> {row.ref.cell}
                      </p>
                      <dl>
                        {fields
                          .filter((f) => row.values[f])
                          .map((f) => (
                            <div key={f}>
                              <dt>{uiText(fieldLabels[f])}</dt>
                              <dd>{row.values[f]}</dd>
                            </div>
                          ))}
                      </dl>
                      <details open>
                        <summary>
                          <UiText text="주변 원본 행" />
                        </summary>
                        <div className="qc-table-scroll">
                          <table>
                            <tbody>
                              {run.rows
                                .filter(
                                  (r) =>
                                    r.ref.sourceVersionId ===
                                      row.ref.sourceVersionId &&
                                    r.ref.sheet === row.ref.sheet &&
                                    Math.abs(r.ref.row - row.ref.row) <= 2,
                                )
                                .map((r) => (
                                  <tr
                                    key={r.id}
                                    className={
                                      r.id === row.id ? 'qc-highlight' : ''
                                    }
                                  >
                                    <th>{r.ref.row}</th>
                                    {r.original.map((c, i) => (
                                      <td key={i}>{c || '—'}</td>
                                    ))}
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                      <p className="qc-meta">
                        {' '}
                        <UiText text="원본 버전" /> {row.ref.sourceVersionId}
                        <br /> <UiText text="원본 SHA256" /> {row.ref.sha256}
                      </p>
                    </>
                  ) : (
                    <p>
                      <UiText text="목록에서 항목을 선택하세요." />
                    </p>
                  )}
                </section>
                <aside className="qc-evidence">
                  <h3>
                    <UiText text="판단 근거와 처리" />
                  </h3>
                  {selected ? (
                    <>
                      <Evidence finding={selected} run={run} />
                      <div className="qc-decision">
                        <h4>
                          <UiText text="사람의 확인" />
                        </h4>
                        {run.trial && (
                          <p>
                            {' '}
                            <UiText text="시험 결과입니다. 지침 승인 후 정식 검수에서 기록할 수 있습니다." />{' '}
                          </p>
                        )}
                        <label>
                          {' '}
                          <UiText text="판단" />{' '}
                          <select
                            disabled={run.trial || !canTriage}
                            value={disposition}
                            onChange={(e) =>
                              setDisposition(
                                e.target.value as Decision['disposition'],
                              )
                            }
                          >
                            {Object.entries(dispositionLabels).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {uiText(label)}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label>
                          {' '}
                          <UiText text="확인 사유" />{' '}
                          <textarea
                            value={reason}
                            disabled={run.trial || !canTriage}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={uiText(
                              '도면·원본·현장 기준 등 확인 근거를 남겨 주세요.',
                            )}
                          />
                        </label>
                        <button
                          className="qc-primary"
                          disabled={
                            run.trial || !canTriage || !!busy || !reason.trim()
                          }
                          onClick={() =>
                            void perform(uiText('판단 기록 중'), async () => {
                              await request({
                                action: 'decision',
                                runId: run.id,
                                findingId: selected.id,
                                disposition,
                                reason,
                              });
                              const data = await request<{
                                run: Run;
                                decisions: Decision[];
                              }>(undefined, run.id);
                              setDecisions(data.decisions);
                              setReason('');
                              setNotice(
                                uiText(
                                  '판단을 서버에 기록했습니다. 원본과 이전 판단 이력은 유지됩니다.',
                                ),
                              );
                            })
                          }
                        >
                          <Check /> <UiText text="판단 저장" />{' '}
                        </button>
                        {decisions
                          .filter((d) => d.findingId === selected.id)
                          .map((d) => (
                            <div className="qc-decision-record" key={d.id}>
                              <strong>
                                {uiText(dispositionLabels[d.disposition])}
                              </strong>
                              <p>{d.reason}</p>
                              <small>
                                {date(d.createdAt)} · {d.actorId}
                              </small>
                            </div>
                          ))}
                      </div>
                    </>
                  ) : (
                    <p>
                      <UiText text="검토 항목의 규칙·비교 근거가 여기에 표시됩니다." />
                    </p>
                  )}
                </aside>
              </div>
            </>
          ) : (
            <div className="qc-empty">
              <ShieldCheck />
              <h2>
                <UiText text="검수 결과를 근거와 함께 남깁니다" />
              </h2>
              <p>
                {' '}
                <UiText text="상단 실행 버튼으로 전체 자료를 확인하고 검수를 시작하세요. 검사하지 않은 항목은 정상으로 표시하지 않습니다." />{' '}
              </p>
              <button
                onClick={
                  adminSettings ? () => setTab('rules') : startBasicReview
                }
                disabled={!editable || !!busy || !state.sources.length}
              >
                {' '}
                <UiText
                  text={
                    adminSettings
                      ? '지침 설정으로 이동'
                      : '전체 자료 확인 후 검수 시작'
                  }
                />{' '}
              </button>
            </div>
          )}
        </section>
      )}
    </fieldset>
  );
}
function Evidence({ finding, run }: { finding: Finding; run: Run }) {
  const uiText = useUiText();
  return (
    <>
      <span className={`qc-level qc-level-${finding.level}`}>
        {finding.level} ·{' '}
        {finding.confidence === 'reproducible'
          ? uiText('재현 가능')
          : finding.confidence === 'pattern'
            ? uiText('패턴 의심')
            : uiText('검토 후보')}
      </span>
      <h4>{uiText(finding.title)}</h4>
      <ul>
        {finding.evidence.map((e) => (
          <li key={e}>{uiText(e)}</li>
        ))}
      </ul>
      {finding.candidate && (
        <p className="qc-candidate">
          {' '}
          <UiText text="수정 후보:" /> {finding.candidate}
          <br />
          <small>
            <UiText text="자동 수정하지 않습니다." />
          </small>
        </p>
      )}
      <p>{uiText(finding.limitation)}</p>
      {finding.peerIds.length > 0 && (
        <details>
          <summary>
            <UiText text="비교 원본" /> {finding.peerIds.length}
            <UiText text="개" />
          </summary>
          {finding.peerIds.map((id) => {
            const row = run.rows.find((r) => r.id === id);
            return row ? (
              <p key={id}>
                {row.ref.filename} / {row.ref.sheet} {row.ref.row}
                <UiText text="행" />
                <br />
                {row.values.trade} · {row.values.code} ·{' '}
                {row.values.dimension || row.values.quantity}
              </p>
            ) : null;
          })}
        </details>
      )}
      <p className="qc-meta">
        {finding.ruleId} <UiText text="· 지침 v" />
        {run.profileVersion}
        <br />
        {run.engineVersion}
      </p>
    </>
  );
}
function ConditionEditor({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (p: Profile) => void;
}) {
  const uiText = useUiText();
  return (
    <>
      <label>
        {' '}
        <UiText text="적용 조건" />{' '}
        <select
          value={profile.match}
          onChange={(e) =>
            onChange({ ...profile, match: e.target.value as Profile['match'] })
          }
        >
          <option value="all">
            <UiText text="모두 만족" />
          </option>
          <option value="any">
            <UiText text="하나라도 만족" />
          </option>
        </select>
      </label>
      {(['conditions', 'exceptions'] as const).map((group) => (
        <div className="qc-conditions" key={group}>
          <h4>
            {group === 'conditions'
              ? uiText('대상 조건 · 비어 있으면 전체')
              : uiText('제외 조건 · 하나라도 맞으면 제외')}
          </h4>
          {profile[group].map((condition, index) => (
            <div key={index}>
              <select
                aria-label={uiText('조건 필드')}
                value={condition.field}
                onChange={(e) =>
                  onChange({
                    ...profile,
                    [group]: profile[group].map((c, i) =>
                      i === index ? { ...c, field: e.target.value } : c,
                    ),
                  })
                }
              >
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {uiText(fieldLabels[f])}
                  </option>
                ))}
              </select>
              <select
                aria-label={uiText('조건 연산자')}
                value={condition.operator}
                onChange={(e) =>
                  onChange({
                    ...profile,
                    [group]: profile[group].map((c, i) =>
                      i === index ? { ...c, operator: e.target.value } : c,
                    ),
                  })
                }
              >
                <option value="equals">
                  <UiText text="같음" />
                </option>
                <option value="contains">
                  <UiText text="포함" />
                </option>
              </select>
              <input
                aria-label={uiText('조건 값')}
                value={condition.value}
                onChange={(e) =>
                  onChange({
                    ...profile,
                    [group]: profile[group].map((c, i) =>
                      i === index ? { ...c, value: e.target.value } : c,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="danger-action"
                onClick={() =>
                  onChange({
                    ...profile,
                    [group]: profile[group].filter((_, i) => i !== index),
                  })
                }
              >
                {' '}
                <UiText text="삭제" />{' '}
              </button>
            </div>
          ))}
          <button
            disabled={profile[group].length >= 8}
            onClick={() =>
              onChange({
                ...profile,
                [group]: [
                  ...profile[group],
                  { field: 'part', operator: 'equals', value: '' },
                ],
              })
            }
          >
            + {group === 'conditions' ? uiText('대상') : uiText('예외')}{' '}
            <UiText text="조건" />{' '}
          </button>
        </div>
      ))}
    </>
  );
}
