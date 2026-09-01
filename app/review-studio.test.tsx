import {
  fireEvent,
  cleanup,
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
  it('keeps text navigation visible and uses the approved source wording', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [], requestId: 'req-1' }), {
        status: 200,
      }),
    );
    render(<ReviewStudio />);
    expect(
      within(screen.getByRole('navigation')).getByText('검수 프로젝트'),
    ).toBeVisible();
    expect(screen.getByText('산출서와 집계표')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByText('첫 검수 프로젝트를 등록하세요')).toBeVisible(),
    );
  });

  it('shows an actionable error state instead of a blank surface', async () => {
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
    render(<ReviewStudio />);
    await waitFor(() =>
      expect(screen.getByText('저장소를 열지 못했습니다.')).toBeVisible(),
    );
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible();
  });

  it('creates and displays a FIN case inside the selected project', async () => {
    const project = {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'P100',
      name: '웹 검수 프로젝트',
      clientName: null,
      status: 'active',
      role: 'project_owner',
      openCaseCount: 0,
      needsAttentionCount: 0,
      createdAt: new Date().toISOString(),
    } as const;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        input instanceof Request
          ? input.url
          : input instanceof URL
            ? input.href
            : input;
      if (url === '/api/projects') {
        return new Response(
          JSON.stringify({ data: [project], requestId: 'r1' }),
        );
      }
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            data: {
              id: '22222222-2222-4222-8222-222222222222',
              projectId: project.id,
              name: '웹 검수 프로젝트 FIN 검수 1',
              discipline: 'FIN',
              status: 'draft',
              ownerId: 'local-user-owner',
              createdAt: new Date().toISOString(),
            },
            requestId: 'r3',
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({ data: [], requestId: 'r2' }));
    });
    render(<ReviewStudio />);
    const row = await screen.findByRole('row', { name: /P100/u });
    fireEvent.click(within(row).getByRole('button', { name: '검수 열기' }));
    await screen.findByText(
      '아직 검수 케이스가 없습니다. FIN 또는 RC 검수를 추가하세요.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'FIN 검수 추가' }));
    expect(
      await screen.findByText('웹 검수 프로젝트 FIN 검수 1'),
    ).toBeVisible();
    expect(screen.getByText('초안')).toBeVisible();
  });

  it('does not show a stale case response after switching projects', async () => {
    const projects = ['P1', 'P2'].map((code, index) => ({
      id: `${index + 1}1111111-1111-4111-8111-111111111111`,
      code,
      name: `${code} 프로젝트`,
      clientName: null,
      status: 'active' as const,
      role: 'project_owner' as const,
      openCaseCount: 1,
      needsAttentionCount: 0,
      createdAt: new Date().toISOString(),
    }));
    let resolveP1: ((response: Response) => void) | undefined;
    let resolveP2: ((response: Response) => void) | undefined;
    let caseRequestCount = 0;
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url =
          input instanceof Request
            ? input.url
            : input instanceof URL
              ? input.href
              : input;
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
    render(<ReviewStudio />);
    const p1 = await screen.findByRole('row', { name: /P1/u });
    fireEvent.click(within(p1).getByRole('button', { name: '검수 열기' }));
    await screen.findByRole('heading', { name: 'P1 프로젝트' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(resolveP1).toBeTypeOf('function'));
    const p2 = screen.getByRole('row', { name: /P2/u });
    fireEvent.click(within(p2).getByRole('button', { name: '검수 열기' }));
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
    expect(screen.getByRole('heading', { name: 'P2 프로젝트' })).toBeVisible();
  });
});

function caseFixture(projectId: string, name: string) {
  return {
    id: crypto.randomUUID(),
    projectId,
    name,
    discipline: 'FIN',
    status: 'draft',
    ownerId: 'local-user-owner',
    createdAt: new Date().toISOString(),
  };
}
