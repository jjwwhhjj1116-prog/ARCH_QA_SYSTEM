import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSummary, ReviewCaseSummary } from '@/lib/domain/contracts';
import {
  defaultProfile,
  type ReviewState,
  type Inspection,
  type Run,
} from '@/lib/review/contracts';
import { parseCsv, suggestMapping } from '@/lib/review/workbook';
import { ReviewWorkbench } from './review-workbench';

const project: ProjectSummary = {
  id: 'p',
  code: 'P',
  name: '합성 검수',
  clientName: null,
  status: 'active',
  role: 'project_owner',
  openCaseCount: 1,
  needsAttentionCount: 0,
  createdAt: '2026-09-07',
};
const cases: ReviewCaseSummary[] = [
  {
    id: 'c',
    projectId: 'p',
    name: '마감팀',
    discipline: 'FIN',
    status: 'ready',
    ownerId: 'u',
    createdAt: '2026-09-07',
  },
];
const sourceId = '10000000-0000-4000-8000-000000000001';
const sheet = parseCsv(
  '내부산출서\n부위,품명,규격,단위,산식,물량\n벽,미장,T10,m2,10,10',
);
const mapping = suggestMapping(sheet, sourceId, '내부산출서.xlsx');
const source = {
  sourceVersionId: sourceId,
  sourceFileId: 'f',
  filename: '내부산출서.xlsx',
  format: 'xlsx' as const,
  packageId: 'pkg',
};
const inspection: Inspection = {
  source,
  sha256: 'a'.repeat(64),
  sheets: [
    { name: 'CSV', rowCount: 3, preview: sheet.rows, suggested: mapping },
  ],
};
const state = (): ReviewState => ({
  canManageGuidelines: true,
  mappingVersionId: null,
  mappings: [],
  sources: [source],
  profiles: [],
  runs: [],
});
const props = {
  project,
  cases,
  initialCaseId: 'c',
  onSources: vi.fn(),
  onCaseChange: vi.fn(),
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mock(data: ReviewState, savedRun?: Run) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (!init?.body)
      return Response.json({
        data: url.includes('&runId=') ? { run: savedRun, decisions: [] } : data,
      });
    const body = JSON.parse(init.body as string);
    if (body.action === 'inspect') {
      if (body.sourceVersionId !== sourceId)
        return Response.json(
          { error: { message: '합성 파일 읽기 실패' } },
          { status: 422 },
        );
      return Response.json({ data: inspection });
    }
    if (body.action === 'mapping') {
      data.mappings = body.mappings;
      data.mappingVersionId = 'saved';
    }
    return Response.json({ data: { id: 'saved' } });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
describe('review preparation and feature navigation', () => {
  it('saves each batch then automatically continues with its run ID', async () => {
    const data = state();
    const profile = {
      ...defaultProfile,
      instructions: [{ id: 'a', text: '산식 검사', enabled: true }],
    };
    data.profiles = [
      {
        id: 'v',
        version: 1,
        status: 'active',
        profile,
        createdAt: 'now',
        trialRunId: 'trial',
      },
    ];
    const initial = {
      id: 'r0',
      projectId: 'p',
      caseId: 'c',
      actorId: 'u',
      createdAt: 'now',
      profileId: 'v',
      profileVersion: 1,
      trial: false,
      engineVersion: '1',
      profile,
      mappings: [],
      rows: [],
      sources: [],
      coverage: [],
      limitations: [],
      findings: [],
      aiChecks: [
        { rowId: 'x', instructionId: 'a', status: 'pending', reason: '미전송' },
      ],
    } as Run;
    data.runs = [
      {
        id: 'r0',
        createdAt: 'now',
        profileVersion: 1,
        trial: false,
        findingCount: 0,
        rowCount: 0,
      },
    ];
    const fetcher = mock(data, initial);
    const base = fetcher.getMockImplementation()!;
    let calls = 0;
    fetcher.mockImplementation(async (url, init) => {
      if (init?.body && JSON.parse(init.body as string).action === 'run') {
        calls++;
        return Response.json({
          data: {
            run: {
              ...initial,
              id: `r${calls}`,
              aiChecks: [
                {
                  ...initial.aiChecks![0],
                  status: calls === 1 ? 'pending' : 'not_flagged',
                },
              ],
            },
            decisions: [],
          },
        });
      }
      return base(url, init);
    });
    render(<ReviewWorkbench {...props} mode="formula-ai" />);
    fireEvent.click(
      await screen.findByRole('button', { name: '미전송 다음 묶음 검수' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: '동의하고 AI 검수 실행' }),
    );
    await waitFor(() => expect(calls).toBe(2), { timeout: 20_000 });
    const requests = fetcher.mock.calls
      .filter(
        ([, init]) =>
          init?.body && JSON.parse(init.body as string).action === 'run',
      )
      .map(([, init]) => JSON.parse(init!.body as string));
    expect(requests.map((r) => r.parentRunId)).toEqual(['r0', 'r1']);
    expect(requests[0].requestKey).not.toBe(requests[1].requestKey);
  }, 25_000);
  it('offers storage-only recovery for ready results, not uncertain requests', async () => {
    const data = state();
    data.pendingAiSaves = [
      { requestKey: 'ready-key', runId: 'ready-run', state: 'ready' },
      { requestKey: 'uncertain-key', runId: 'uncertain-run', state: 'claimed' },
    ];
    const fetcher = mock(data);
    render(<ReviewWorkbench {...props} mode="formula-ai" />);
    const retry = await screen.findByRole('button', {
      name: 'AI 결과 저장 재시도',
    });
    expect(
      screen.getAllByRole('button', { name: 'AI 결과 저장 재시도' }),
    ).toHaveLength(1);
    expect(
      screen.getByText(/응답 보관 여부를 확인할 수 없습니다/u),
    ).toBeVisible();
    fetcher.mockImplementationOnce(async () =>
      Response.json(
        { error: { message: '합성 복구 저장 실패' } },
        { status: 503 },
      ),
    );
    fireEvent.click(retry);
    await screen.findByText('합성 복구 저장 실패');
    expect(retry).toBeEnabled();
    const posts = fetcher.mock.calls.filter(([, init]) => init?.body);
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1]!.body as string)).toEqual({
      action: 'resume-ai-save',
      caseId: 'c',
      requestKey: 'ready-key',
    });
  });
  it('routes Gemini to explicit AI and respects cancellation', async () => {
    const data = state();
    data.profiles = [
      {
        id: 'approved',
        version: 1,
        status: 'active',
        profile: {
          ...defaultProfile,
          instructions: [{ id: 'test', text: '합성 지침', enabled: true }],
        },
        createdAt: 'now',
        trialRunId: null,
      },
    ];
    data.mappings = [{ ...mapping, confirmed: true }];
    const fetcher = mock(data);
    render(<ReviewWorkbench {...props} mode="formula-ai" />);
    const ai = await screen.findByRole('button', {
      name: 'Gemini AI 검수 시작',
    });
    await waitFor(() => expect(ai).toBeEnabled());
    expect(
      screen.getByRole('button', { name: '기본검사 · AI 미사용' }),
    ).toBeEnabled();
    fireEvent.click(ai);
    expect(fetcher.mock.calls.filter(([, init]) => init?.body)).toHaveLength(0);
    expect(
      screen.getByRole('region', { name: 'AI 검수 실행 확인' }),
    ).toHaveTextContent('행·지침 조합');
    fetcher.mockImplementationOnce(async () =>
      Response.json(
        { error: { message: '합성 AI 공급자 오류' } },
        { status: 503 },
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: '동의하고 AI 검수 실행' }),
    );
    await screen.findByText('합성 AI 공급자 오류');
    const body = JSON.parse(
      fetcher.mock.calls.find(([, init]) => init?.body)![1]!.body as string,
    );
    expect(body).toMatchObject({
      action: 'run',
      includeAi: true,
      trial: false,
      profileId: 'approved',
      caseId: 'c',
    });
    expect(body.requestKey).toMatch(/^[a-f0-9-]{36}$/u);
  });
  it('saves the selected report, shows provider failure and permits retry without losing download', async () => {
    const data = state();
    const run: Run = {
      id: 'run',
      projectId: 'p',
      caseId: 'c',
      actorId: 'u',
      createdAt: '2026-09-07',
      profileId: 'v',
      profileVersion: 1,
      trial: false,
      engineVersion: '1',
      profile: defaultProfile,
      mappings: [],
      rows: [],
      sources: [],
      coverage: [],
      limitations: [],
      findings: [],
    };
    data.runs = [
      {
        id: run.id,
        createdAt: run.createdAt,
        profileVersion: 1,
        trial: false,
        findingCount: 0,
        rowCount: 0,
      },
    ];
    const fetcher = mock(data, run);
    render(<ReviewWorkbench {...props} mode="formula-ai" />);
    const save = await screen.findByRole('button', { name: '보고서 저장' });
    expect(
      screen.getByRole('heading', { name: '부분 검수 · 전체 완료 아님' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('등록 파일·시트 전체 대조 기록 없음'),
    ).toBeInTheDocument();
    fetcher.mockImplementationOnce(async () =>
      Response.json({ error: { message: '합성 저장 실패' } }, { status: 503 }),
    );
    fireEvent.click(save);
    await screen.findByText('합성 저장 실패');
    expect(screen.getByRole('link', { name: 'Excel 보고서' })).toHaveAttribute(
      'href',
      '/api/projects/p/review?caseId=c&runId=run&format=xlsx',
    );
    fetcher.mockImplementationOnce(async () =>
      Response.json({ data: { saved: true } }),
    );
    fireEvent.click(save);
    await screen.findByText(/Excel 보고서 저장 완료/u);
    const writes = fetcher.mock.calls.filter(
      ([, init]) =>
        init?.body && JSON.parse(init.body as string).action === 'save-report',
    );
    expect(writes).toHaveLength(2);
    expect(JSON.parse(writes[1][1]!.body as string)).toMatchObject({
      action: 'save-report',
      caseId: 'c',
      runId: 'run',
    });
  });
  it('changes the visible feature before any run without exposing rule editing', async () => {
    mock(state());
    const view = render(<ReviewWorkbench {...props} mode="formula-ai" />);
    await screen.findByText('산출서를 한 번에 준비하세요');
    expect(screen.queryByText('지침 설정·시험')).toBeNull();
    view.rerender(<ReviewWorkbench {...props} mode="duplicate-ai" />);
    expect(
      screen.getByRole('heading', { name: '중복 ITEM AI 검수' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', {
        name: '동별집계표가 중복 검수의 기준 자료입니다',
      }),
    ).toBeVisible();
    view.rerender(<ReviewWorkbench {...props} mode="formula-ai" />);
    expect(
      screen.getByRole('heading', { name: '산출식 AI 검수' }),
    ).toBeVisible();
  });
  it('prepares all standard sources with one click and preserves existing mapping', async () => {
    const data = state();
    data.sources.push({
      ...source,
      sourceVersionId: 'failed',
      filename: '실패.xlsx',
    });
    const fetcher = mock(data);
    render(<ReviewWorkbench {...props} mode="formula-ai" />);
    fireEvent.click(
      await screen.findByRole('button', { name: '자료 자동 확인·저장' }),
    );
    await screen.findByText(/1개 시트의 열 연결을 함께 저장/u);
    const writes = fetcher.mock.calls.filter(
      ([, init]) =>
        init?.body && JSON.parse(init.body as string).action === 'mapping',
    );
    expect(writes).toHaveLength(1);
    expect(data.mappings[0]).toMatchObject({
      confirmed: true,
      arithmeticBasis: 'unknown',
    });
    expect(screen.getByText(/읽기 실패 · 합성 파일/u)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: '자료 자동 확인·저장' }),
    );
    await screen.findByText(/기존 열 연결은 유지/u);
    expect(
      fetcher.mock.calls.filter(
        ([, init]) =>
          init?.body && JSON.parse(init.body as string).action === 'mapping',
      ),
    ).toHaveLength(1);
  });
  it('clears the prior source when the next source fails', async () => {
    const data = state();
    data.sources.push({
      ...source,
      sourceVersionId: 'failed',
      filename: '실패.xlsx',
    });
    mock(data);
    render(<ReviewWorkbench {...props} mode="formula-ai" />);
    fireEvent.click(
      await screen.findByRole('button', { name: /내부산출서.xlsx/u }),
    );
    await screen.findByRole('heading', { name: '내부산출서.xlsx' });
    fireEvent.click(screen.getByRole('button', { name: /실패.xlsx/u }));
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('heading', { name: '내부산출서.xlsx' }),
    ).toBeNull();
    expect(screen.queryByText(/저장하지 않은 열 매핑/u)).toBeNull();
  });
  it('discards unsaved column edits on an accepted feature switch', async () => {
    const data = state();
    data.mappings = [mapping];
    mock(data);
    const view = render(<ReviewWorkbench {...props} mode="formula-ai" />);
    fireEvent.click(
      await screen.findByRole('button', { name: /내부산출서.xlsx/u }),
    );
    const header = await screen.findByRole('spinbutton', { name: '머리글 행' });
    fireEvent.change(header, { target: { value: '3' } });
    expect(screen.getByText(/저장하지 않은 열 매핑/u)).toBeVisible();
    view.rerender(<ReviewWorkbench {...props} mode="duplicate-ai" />);
    expect(screen.getByRole('spinbutton', { name: '머리글 행' })).toHaveValue(
      2,
    );
    expect(screen.queryByText(/저장하지 않은 열 매핑/u)).toBeNull();
  });
  it('does not label a manually edited mapping as automatic recognition', async () => {
    const data = state();
    data.mappings = [mapping];
    mock(data);
    render(<ReviewWorkbench {...props} mode="formula-ai" />);
    fireEvent.click(
      await screen.findByRole('button', { name: /내부산출서.xlsx/u }),
    );
    fireEvent.change(
      await screen.findByRole('spinbutton', { name: '머리글 행' }),
      {
        target: { value: '3' },
      },
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: /이 시트의 머리글/u }),
    );
    fireEvent.click(screen.getByRole('button', { name: '열 연결 저장' }));
    await waitFor(() => expect(data.mappings[0]?.headerRow).toBe(3));
    expect(data.mappings[0]?.recognition).toBeUndefined();
  });
  it('uses active profile even if newest is draft; settings alone exposes trials', async () => {
    const data = state();
    data.profiles = [
      {
        id: 'draft',
        version: 2,
        status: 'draft',
        profile: { ...defaultProfile, name: '미승인' },
        createdAt: 'now',
        trialRunId: null,
      },
      {
        id: 'active',
        version: 1,
        status: 'active',
        profile: defaultProfile,
        createdAt: 'before',
        trialRunId: null,
      },
    ];
    data.mappings = [mapping];
    mock(data);
    const view = render(<ReviewWorkbench {...props} mode="formula-ai" />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '승인 지침 검사 · AI 미사용' }),
      ).toBeEnabled(),
    );
    expect(
      screen.getByText(/적용 지침: FIN 기본 검토 지침 · v1/u),
    ).toBeVisible();
    expect(screen.queryByText('지침 시험 실행')).toBeNull();
    view.unmount();
    render(<ReviewWorkbench {...props} mode="formula-ai" adminSettings />);
    expect(
      await screen.findByRole('heading', { name: '검수 지침 관리' }),
    ).toBeVisible();
    expect(screen.getByText('지침 시험 실행')).toBeVisible();
  });
  it('switches results and clears old search without losing run identity', async () => {
    const data = state();
    data.runs = [
      {
        id: 'run',
        createdAt: '2026-09-07',
        profileVersion: 1,
        trial: false,
        findingCount: 2,
        rowCount: 0,
      },
    ];
    const run: Run = {
      id: 'run',
      projectId: 'p',
      caseId: 'c',
      createdAt: '2026-09-07',
      actorId: 'u',
      profileId: 'v',
      profileVersion: 1,
      trial: false,
      engineVersion: '1',
      profile: defaultProfile,
      mappings: [],
      rows: [],
      sources: [],
      coverage: [],
      limitations: [],
      findings: [
        {
          id: 'a',
          ruleId: 'CALC-007',
          rowId: 'a',
          level: 'A',
          severity: 'check',
          confidence: 'reproducible',
          title: '산술 불일치 합성',
          evidence: [],
          peerIds: [],
          limitation: '',
        },
        {
          id: 'b',
          ruleId: 'ITEM-018',
          rowId: 'b',
          level: 'C',
          severity: 'check',
          confidence: 'candidate',
          title: '공종 분산 합성',
          evidence: [],
          peerIds: [],
          limitation: '',
        },
      ],
    };
    mock(data, run);
    const view = render(<ReviewWorkbench {...props} mode="formula-ai" />);
    await screen.findByRole('heading', { name: '산술 불일치 합성' });
    fireEvent.change(screen.getByRole('textbox', { name: '검토 항목 검색' }), {
      target: { value: '없음' },
    });
    view.rerender(<ReviewWorkbench {...props} mode="duplicate-ai" />);
    expect(
      screen.getByRole('heading', { name: '공종 분산 합성' }),
    ).toBeVisible();
    expect(screen.queryByText('산술 불일치 합성')).toBeNull();
    expect(screen.getByRole('combobox', { name: '실행 이력' })).toHaveValue(
      'run',
    );
    expect(screen.getByRole('textbox', { name: '검토 항목 검색' })).toHaveValue(
      '',
    );
  });
});
