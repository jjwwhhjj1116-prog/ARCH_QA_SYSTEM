import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewStudio } from './review-studio';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ReviewStudio', () => {
  it('uses the official title, exact navigation, and source wording', async () => {
    mockProjects([]);
    renderStudio();
    expect(
      screen.getByText('CONCOST 기술본부 QC 스튜디오', {
        selector: '.topbar-title strong',
      }),
    ).toBeVisible();
    const navigation = screen.getByRole('navigation', { name: 'QC 업무 단계' });
    for (const label of [
      '프로젝트 등록',
      '프로젝트 자료',
      '산출식 AI 검수',
      '중복 아이템 AI 검수',
      '수량산출 분석표',
      '설정',
    ]) {
      expect(within(navigation).getByText(label)).toBeVisible();
    }
    await screen.findByText('첫 검수 프로젝트를 등록하세요');
    expect(screen.getByText(/산출서와 집계표/u)).toBeVisible();
    expect(document.querySelectorAll('.brand-logo')).toHaveLength(2);
  });

  it('keeps project registration and project data on separate screens', async () => {
    const project = projectFixture('P100', '웹 검수 프로젝트');
    mockProjects([project]);
    renderStudio();
    const row = await screen.findByRole('row', { name: /웹 검수 프로젝트/u });
    expect(screen.queryByText('팀별 검수 케이스')).toBeNull();
    expect(screen.queryByText('산출서와 집계표 원본 등록')).toBeNull();
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: '산출서와 집계표를 등록하세요',
      }),
    ).toBeVisible();
    expect(screen.getByText('팀별 검수 케이스')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: '새 프로젝트 등록' }),
    ).toBeNull();
  });

  it('shows an actionable error instead of a blank surface', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'DB_ERROR',
            message: '저장소를 열지 못했습니다.',
            requestId: 'req-2',
          },
        }),
        { status: 500 },
      ),
    );
    renderStudio();
    expect(await screen.findByText('저장소를 열지 못했습니다.')).toBeVisible();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible();
  });

  it('creates and displays a FIN case inside the selected project', async () => {
    const project = projectFixture('P100', '웹 검수 프로젝트');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = requestUrl(input);
      if (url === '/api/projects') {
        return new Response(
          JSON.stringify({ data: [project], requestId: 'r1' }),
        );
      }
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            data: caseFixture(project.id, '웹 검수 프로젝트 마감 검수 1'),
            requestId: 'r3',
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({ data: [], requestId: 'r2' }));
    });
    renderStudio();
    const row = await screen.findByRole('row', { name: /웹 검수 프로젝트/u });
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    await screen.findByText('먼저 팀별 검수 케이스를 만드세요.');
    fireEvent.click(screen.getByRole('button', { name: '마감팀 케이스' }));
    expect(
      await screen.findByText('웹 검수 프로젝트 마감 검수 1'),
    ).toBeVisible();
    expect(screen.getByText('초안')).toBeVisible();
  });

  it('exposes expandable structure and finish analysis groups', async () => {
    mockProjects([]);
    renderStudio();
    await screen.findByText('첫 검수 프로젝트를 등록하세요');
    const analysis = screen.getByRole('button', { name: /수량산출 분석표/u });
    expect(analysis).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('면적 분석표(내부)')).toBeVisible();
    expect(screen.getByText('아파트옹벽')).toBeVisible();
    fireEvent.click(analysis);
    expect(analysis).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('면적 분석표(내부)')).toBeNull();
  });

  it('does not show a stale case response after switching projects', async () => {
    const projects = [
      projectFixture(
        'P1',
        'P1 프로젝트',
        '11111111-1111-4111-8111-111111111111',
      ),
      projectFixture(
        'P2',
        'P2 프로젝트',
        '22222222-2222-4222-8222-222222222222',
      ),
    ];
    let resolveP1: ((response: Response) => void) | undefined;
    let resolveP2: ((response: Response) => void) | undefined;
    let caseRequestCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url === '/api/projects') {
        return new Response(
          JSON.stringify({ data: projects, requestId: 'r1' }),
        );
      }
      return await new Promise<Response>((resolve) => {
        caseRequestCount += 1;
        if (caseRequestCount === 1) resolveP1 = resolve;
        else resolveP2 = resolve;
      });
    });
    renderStudio();
    const p1 = await screen.findByRole('row', { name: /P1 프로젝트/u });
    fireEvent.click(
      within(p1).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    await waitFor(() => expect(resolveP1).toBeTypeOf('function'));
    fireEvent.change(screen.getByRole('combobox', { name: '현재 프로젝트' }), {
      target: { value: projects[1].id },
    });
    await waitFor(() => expect(resolveP2).toBeTypeOf('function'));
    resolveP2?.(
      new Response(
        JSON.stringify({
          data: [caseFixture(projects[1].id, 'P2 케이스')],
          requestId: 'r2',
        }),
      ),
    );
    expect(await screen.findByText('P2 케이스')).toBeVisible();
    resolveP1?.(
      new Response(
        JSON.stringify({
          data: [caseFixture(projects[0].id, 'P1 늦은 케이스')],
          requestId: 'r3',
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText('P1 늦은 케이스')).toBeNull(),
    );
  });
});

function renderStudio() {
  return render(
    <ReviewStudio
      currentUser={{ displayName: '김PM', email: 'jjwwhhjj1116@gmail.com' }}
    />,
  );
}

function mockProjects(projects: ReturnType<typeof projectFixture>[]) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ data: projects, requestId: 'req-1' })),
  );
}

function requestUrl(input: RequestInfo | URL) {
  return input instanceof Request
    ? input.url
    : input instanceof URL
      ? input.href
      : input;
}

function projectFixture(code: string, name: string, id = crypto.randomUUID()) {
  return {
    id,
    code,
    name,
    clientName: null,
    status: 'active' as const,
    role: 'project_owner' as const,
    openCaseCount: 0,
    needsAttentionCount: 0,
    createdAt: new Date().toISOString(),
  };
}

function caseFixture(projectId: string, name: string) {
  return {
    id: crypto.randomUUID(),
    projectId,
    name,
    discipline: 'FIN' as const,
    status: 'draft' as const,
    ownerId: 'local-user-owner',
    createdAt: new Date().toISOString(),
  };
}
