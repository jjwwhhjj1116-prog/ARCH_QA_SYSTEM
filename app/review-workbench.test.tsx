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
      expect(screen.getByRole('button', { name: '검수 실행' })).toBeEnabled(),
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
