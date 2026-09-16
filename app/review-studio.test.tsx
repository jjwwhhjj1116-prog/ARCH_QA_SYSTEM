import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { SourcePackageSummary } from '@/lib/ingestion/contracts';
import { ProjectDataWorkspace } from './project-data-workspace';
import { ReviewStudio } from './review-studio';

// jsdom File does not implement Blob.arrayBuffer(); exercise native hashing.
Object.defineProperty(File.prototype, 'arrayBuffer', {
  configurable: true,
  value: function (this: File) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  },
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ReviewStudio', () => {
  it.each([false, true])(
    'prepares registered originals before opening review and permits retry after failure (%s)',
    async (failFirst) => {
      const project = projectFixture('P100', '등록 원본 검수 연결');
      const reviewCase = caseFixture(project.id, '마감');
      const pending = sourcePackageFixture({
        projectId: project.id,
        reviewCaseId: reviewCase.id,
        status: 'upload_pending',
      });
      const registered = {
        ...pending,
        files: pending.files.map((file) => ({
          ...file,
          status: 'uploaded' as const,
          uploadState: 'uploaded' as const,
        })),
      };
      let release!: (response: Response) => void;
      let preparations = 0;
      const fetcher = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input, init) => {
          const url = requestUrl(input);
          if (url === '/api/projects') return jsonResponse([project]);
          if (url.endsWith('/cases')) return jsonResponse([reviewCase]);
          if (url.endsWith('/source-packages'))
            return jsonResponse([registered]);
          if (
            url === `/api/projects/${project.id}/review` &&
            init?.method === 'POST'
          ) {
            expect(
              JSON.parse(typeof init.body === 'string' ? init.body : 'null'),
            ).toEqual({
              action: 'prepare-source',
              caseId: reviewCase.id,
              uploadId: pending.files[0].uploadId,
            });
            preparations++;
            return new Promise<Response>((resolve) => {
              release = resolve;
            });
          }
          if (url.includes('/review?'))
            return jsonResponse({
              sources: [],
              profiles: [],
              runs: [],
              mappings: [],
            });
          throw new Error(`Unexpected request: ${url}`);
        });
      renderProjectWorkspace();
      fireEvent.click(
        within(
          await screen.findByRole('row', { name: /등록 원본 검수 연결/u }),
        ).getByRole('button', { name: '선택하고 자료 등록' }),
      );
      fireEvent.click(await screen.findByRole('button', { name: '마감팀' }));
      const start = await screen.findByRole('button', {
        name: /STEP 2 · AI 검수 시작/u,
      });
      await waitFor(() => expect(start).toBeEnabled());
      fireEvent.click(start);
      fireEvent.click(start);
      expect(preparations).toBe(1);
      expect(start).toBeDisabled();
      if (failFirst) {
        release(
          Response.json(
            {
              error: {
                code: 'SOURCE_INSPECTION_FAILED',
                message: '검사 중단 · 원본 보존',
                requestId: 'test',
              },
            },
            { status: 422 },
          ),
        );
        await screen.findByText(/검사 중단 · 원본 보존/u);
        expect(screen.getAllByText('내부산출서.csv').length).toBeGreaterThan(0);
        expect(
          screen.getByRole('button', { name: /원본 다운로드/u }),
        ).toBeEnabled();
        await waitFor(() => expect(start).toBeEnabled());
        fireEvent.click(start);
        expect(preparations).toBe(2);
      }
      release(
        jsonResponse({
          prepared: true,
          sourceVersionId: pending.files[0].sourceVersionId,
        }),
      );
      await waitFor(() =>
        expect(
          within(
            screen.getByRole('navigation', { name: '작업 순서' }),
          ).getByRole('button', { name: /산출식 AI 검수/u }),
        ).toHaveAttribute('aria-current', 'page'),
      );
      expect(
        fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE'),
      ).toBe(false);
      expect(
        fetcher.mock.calls.some(([input]) =>
          requestUrl(input).endsWith('/transfer'),
        ),
      ).toBe(false);
    },
  );

  it('retains selected files and reports a package-stage non-JSON 503 without claiming a transfer failure', async () => {
    const project = projectFixture('P100', '등록 응답 검증');
    const reviewCase = caseFixture(project.id, '마감');
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = requestUrl(input);
        if (url === '/api/projects') return jsonResponse([project]);
        if (url.endsWith('/cases')) return jsonResponse([reviewCase]);
        if (url.endsWith('/source-packages')) {
          if (init?.method === 'POST')
            return new Response('<html>private platform response</html>', {
              status: 503,
            });
          return jsonResponse([]);
        }
        throw new Error(`Unexpected request: ${url}`);
      });
    renderProjectWorkspace();
    fireEvent.click(
      within(
        await screen.findByRole('row', { name: /등록 응답 검증/u }),
      ).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: '마감팀' }));
    await screen.findByText('이 팀에 저장된 산출서와 집계표가 아직 없습니다.');
    fireEvent.change(screen.getByLabelText(/산출서와 집계표 선택/u), {
      target: {
        files: [
          new File(['a,b\nc,1\n'], '내부산출서.csv', { type: 'text/csv' }),
        ],
      },
    });
    const submit = screen.getByRole('button', { name: '선택 파일 저장' });
    fireEvent.submit(submit.closest('form')!);
    await screen.findByText(/서버에서 파일 처리가 중단되었습니다\(HTTP 503\)/u);
    expect(
      screen.getByText(/파일 전송은 시작하지 않았으며 선택 파일은 유지됩니다/u),
    ).toBeVisible();
    expect(screen.queryByText(/private platform response/u)).toBeNull();
    expect(screen.getByText('내부산출서.csv', { exact: true })).toBeVisible();
    expect(
      fetcher.mock.calls.filter(([url]) =>
        requestUrl(url).startsWith('/api/uploads/'),
      ),
    ).toHaveLength(0);
    await waitFor(() => expect(submit).toBeEnabled());
  });
  it.each([true, false])(
    'uses resumable registration without promoting pending originals to AI-ready (success: %s)',
    async (succeeds) => {
      const project = projectFixture('P100', '분할 저장 프로젝트');
      const reviewCase = caseFixture(project.id, '분할 저장 마감');
      const pending = sourcePackageFixture({
        projectId: project.id,
        reviewCaseId: reviewCase.id,
        status: 'upload_pending',
      });
      const resumable = {
        ...pending,
        files: pending.files.map((file) => ({
          ...file,
          transferMode: 'resumable' as const,
        })),
      };
      let transferred = false;
      const fetcher = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input, init) => {
          const url = requestUrl(input);
          if (url === '/api/projects') return jsonResponse([project]);
          if (url.endsWith('/cases')) return jsonResponse([reviewCase]);
          if (url.endsWith('/source-packages')) {
            if (init?.method === 'POST') return jsonResponse(resumable, 201);
            return jsonResponse(
              transferred
                ? [
                    {
                      ...resumable,
                      files: resumable.files.map((file) => ({
                        ...file,
                        status: 'uploaded',
                      })),
                    },
                  ]
                : [],
            );
          }
          if (url.endsWith('/transfer')) {
            if (!succeeds)
              return Response.json(
                {
                  error: {
                    code: 'DRIVE_NOT_CONNECTED',
                    message: '회사 Drive 연결을 확인하세요.',
                    requestId: 'r-drive',
                  },
                },
                { status: 409 },
              );
            if (init?.method === 'PUT') transferred = true;
            return jsonResponse({
              uploadId: pending.files[0].uploadId,
              offset: transferred ? 8 : 0,
              sizeBytes: 8,
              chunkBytes: 1048576,
              status: transferred ? 'uploaded' : 'uploading',
            });
          }
          throw new Error(`Unexpected request: ${url}`);
        });
      renderProjectWorkspace();
      fireEvent.click(
        within(
          await screen.findByRole('row', { name: /분할 저장 프로젝트/u }),
        ).getByRole('button', { name: '선택하고 자료 등록' }),
      );
      fireEvent.click(await screen.findByRole('button', { name: '마감팀' }));
      await screen.findByText(
        '이 팀에 저장된 산출서와 집계표가 아직 없습니다.',
      );
      fireEvent.change(screen.getByLabelText(/산출서와 집계표 선택/u), {
        target: {
          files: [
            new File(['a,b\nc,1\n'], '내부산출서.csv', { type: 'text/csv' }),
          ],
        },
      });
      const submit = screen.getByRole('button', { name: '선택 파일 저장' });
      await waitFor(() => expect(submit).toBeEnabled());
      fireEvent.submit(submit.closest('form')!);
      if (succeeds) {
        await waitFor(() =>
          expect(
            document.querySelector('.source-upload-progress'),
          ).toHaveTextContent('1개 등록 완료'),
        );
        expect(
          screen.getByText(
            '자료 등록 완료. AI 검수 시작을 누르면 저장된 자료로 다음 단계를 진행합니다.',
          ),
        ).toBeVisible();
        expect(
          screen.getByRole('button', { name: /원본 다운로드/u }),
        ).toBeEnabled();
      } else {
        expect(
          await screen.findByText('회사 Drive 연결을 확인하세요.'),
        ).toBeVisible();
        expect(screen.getByText(/DRIVE_NOT_CONNECTED/u)).toBeVisible();
        expect(
          screen.getByRole('button', { name: '선택 파일 저장' }),
        ).toBeEnabled();
      }
      expect(
        screen.getByRole('button', { name: /STEP 2 · AI 검수 시작/u }),
      ).toBeDisabled();
      expect(
        fetcher.mock.calls.some(([input]) =>
          requestUrl(input).endsWith('/bytes'),
        ),
      ).toBe(false);
    },
  );

  it('separates personal and admin settings without requiring a project for company connections', async () => {
    mockProjects([]);
    render(
      <ReviewStudio
        currentUser={{
          displayName: '관리자',
          email: 'yjw@con-cost.com',
          isAdmin: true,
        }}
      />,
    );
    await screen.findByText('첫 검수 프로젝트를 등록하세요');
    fireEvent.click(screen.getByRole('button', { name: /^설정$/u }));
    expect(
      screen.getByRole('heading', { name: '개인 설정', level: 1 }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: '회사 공용 Gemini API' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^관리자 설정$/u }));
    expect(
      await screen.findByRole('heading', { name: '회사 공용 Gemini API' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^검수 지침 관리$/u }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /^개인 설정$/u }));
    expect(
      screen.queryByRole('heading', { name: '회사 공용 Gemini API' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^홈$/u }));
    await screen.findByText('첫 검수 프로젝트를 등록하세요');
  });
  it('opens home with the official title and an ordered left workflow instead of settings', async () => {
    mockProjects([]);
    renderStudio();
    expect(
      screen.getByText('CONCOST 기술본부 QC 스튜디오', {
        selector: '.topbar-title strong',
      }),
    ).toBeVisible();
    const navigation = screen.getByRole('navigation', { name: '작업 순서' });
    expect(
      within(navigation).getByRole('button', { name: /^홈$/u }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(navigation).getByRole('button', { name: /^프로젝트$/u }),
    ).toBeVisible();
    expect(
      within(navigation).queryByRole('button', { name: /^설정$/u }),
    ).toBeNull();
    const settings = screen.getByRole('button', { name: /^설정$/u });
    expect(settings).toBeVisible();
    expect(settings.closest('.sidebar-foot')).not.toBeNull();
    expect(settings.nextElementSibling).toHaveClass('employee-profile');
    expect(settings.closest('.workflow-navigation')).toBeNull();
    for (const label of [
      'STEP 1. 자료등록',
      'STEP 2. AI 검수',
      'STEP 3. 수량산출 분석표',
    ]) {
      expect(within(navigation).getByText(label)).toBeVisible();
    }
    expect(
      within(navigation).queryByRole('button', { name: '새 프로젝트' }),
    ).toBeNull();
    expect(screen.queryByRole('region', { name: '검수 진행 단계' })).toBeNull();
    expect(screen.getByRole('heading', { name: '검수 작업 홈' })).toBeVisible();
    expect(screen.queryByText('개인 Gemini API 연결')).toBeNull();
    expect(screen.getByRole('button', { name: '새 프로젝트' })).toBeVisible();
    await screen.findByText('첫 검수 프로젝트를 등록하세요');
    expect(screen.getByText(/산출서와 집계표/u)).toBeVisible();
    expect(document.querySelectorAll('.brand-logo')).toHaveLength(2);
    expect(document.querySelector('.qc-current-project')).toBeNull();
    for (const label of ['마감', '구조']) {
      expect(
        within(navigation)
          .getByText(label, { selector: 'summary' })
          .closest('details'),
      ).not.toHaveAttribute('open');
    }
  });

  it('opens settings from the fixed footer with the same selected state and returns home', async () => {
    mockProjects([]);
    renderStudio();
    await screen.findByText('첫 검수 프로젝트를 등록하세요');
    const settings = screen.getByRole('button', { name: /^설정$/u });
    expect(settings).not.toHaveAttribute('aria-current');
    settings.focus();
    expect(settings).toHaveFocus();
    fireEvent.click(settings);
    expect(settings).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('heading', { name: /^개인 설정$/u, level: 1 }),
    ).toBeVisible();
    expect(settings.querySelector('.lucide-settings')).not.toBeNull();
    expect(settings.querySelector('.nav-current-check')).not.toBeNull();
    fireEvent.click(
      within(screen.getByRole('navigation', { name: '작업 순서' })).getByRole(
        'button',
        { name: '홈' },
      ),
    );
    expect(settings).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { name: '검수 작업 홈' })).toBeVisible();
  });

  it('keeps the current project visible when returning home and resumes the same project', async () => {
    const project = projectFixture('P100', '계속 검수할 프로젝트');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url === '/api/projects') return jsonResponse([project]);
      if (url.endsWith('/cases')) return jsonResponse([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    renderProjectWorkspace();
    fireEvent.click(
      within(
        await screen.findByRole('row', { name: /계속 검수할 프로젝트/u }),
      ).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    await screen.findByText('등록할 팀 선택');
    const workflow = screen.getByRole('navigation', { name: '작업 순서' });
    fireEvent.click(within(workflow).getByRole('button', { name: '홈' }));
    const home = screen.getByRole('region', { name: '검수 작업 홈' });
    expect(home.querySelector('.qc-current-project')).toHaveTextContent(
      `현재 프로젝트: ${project.name}`,
    );
    expect(screen.getByRole('combobox', { name: '현재 프로젝트' })).toHaveValue(
      project.id,
    );
    fireEvent.click(
      within(workflow).getByRole('button', { name: 'STEP 1. 자료등록' }),
    );
    expect(
      await screen.findByRole('region', { name: project.name }),
    ).toBeVisible();
    expect(screen.getByRole('combobox', { name: '현재 프로젝트' })).toHaveValue(
      project.id,
    );
  });

  it('keeps project registration and project data on separate screens', async () => {
    const project = projectFixture('P100', '웹 검수 프로젝트');
    mockProjects([project]);
    renderProjectWorkspace();
    const row = await screen.findByRole('row', { name: /웹 검수 프로젝트/u });
    expect(screen.queryByText('등록할 팀 선택')).toBeNull();
    expect(screen.queryByText('산출서와 집계표 원본 등록')).toBeNull();
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: '산출서와 집계표를 등록하세요',
      }),
    ).toBeVisible();
    expect(screen.getByText('등록할 팀 선택')).toBeVisible();
    expect(
      screen.getByRole('button', { name: '프로젝트 다시 선택' }),
    ).toBeVisible();
    expect(
      screen.queryByText('자료를 등록할 프로젝트를 선택하세요'),
    ).toBeNull();
    expect(screen.queryByText(/RAG STATUS/u)).toBeNull();
  });

  it('asks once before project deletion without requiring the project name', async () => {
    const project = projectFixture('P100', '삭제 확인 프로젝트');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = requestUrl(input);
      if (url === '/api/projects' && !init?.method)
        return jsonResponse([project]);
      if (url === `/api/projects/${project.id}` && init?.method === 'DELETE')
        return jsonResponse({
          ...project,
          status: 'archived',
          deletionMode: 'archive',
        });
      throw new Error(`Unexpected request: ${url}`);
    });

    renderProjectWorkspace();
    const row = await screen.findByRole('row', { name: /삭제 확인 프로젝트/u });
    fireEvent.click(within(row).getByRole('button', { name: '삭제' }));
    const dialog = screen.getByRole('dialog', {
      name: '프로젝트를 목록에서 삭제할까요?',
    });
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    await waitFor(() =>
      expect(screen.queryByText('삭제 확인 프로젝트')).toBeNull(),
    );
  });

  it('creates a project in the right workspace while keeping the selected project until save', async () => {
    const existing = projectFixture('P1', '기존 프로젝트');
    const created = projectFixture('P2', '오른쪽 등록 프로젝트');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = requestUrl(input);
        if (url === '/api/projects' && init?.method === 'POST')
          return jsonResponse(created, 201);
        if (url === '/api/projects') return jsonResponse([existing]);
        if (url.endsWith('/cases')) return jsonResponse([]);
        throw new Error(`Unexpected request: ${url}`);
      });
    renderProjectWorkspace();
    fireEvent.click(
      within(
        await screen.findByRole('row', { name: /기존 프로젝트/u }),
      ).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    await screen.findByText('등록할 팀 선택');
    openProjectManagement();
    fireEvent.click(screen.getByRole('button', { name: '새 프로젝트 등록' }));
    const form = screen.getByRole('form', { name: '새 프로젝트 등록' });
    const nav = screen.getByRole('navigation', { name: '작업 순서' });
    expect(nav).not.toContainElement(form);
    expect(screen.getByRole('combobox', { name: '현재 프로젝트' })).toHaveValue(
      existing.id,
    );
    fireEvent.change(
      within(form).getByRole('textbox', { name: '프로젝트명' }),
      { target: { value: created.name } },
    );
    fireEvent.change(within(form).getByRole('textbox', { name: /발주처/u }), {
      target: { value: '테스트 발주처' },
    });
    fireEvent.submit(form);
    expect(
      await screen.findByRole('region', { name: created.name }),
    ).toBeVisible();
    expect(screen.queryByRole('form', { name: '새 프로젝트 등록' })).toBeNull();
    const requests = fetchSpy.mock.calls.filter(
      ([, init]) => init?.method === 'POST',
    );
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0][1]?.body as string)).toMatchObject({
      name: created.name,
      clientName: '테스트 발주처',
    });
  });

  it('keeps right-workspace deletion cancelable and retryable, then clears a deleted current project', async () => {
    const project = projectFixture('P1', '오른쪽 삭제 프로젝트');
    let failDelete = true;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = requestUrl(input);
        if (url === '/api/projects') return jsonResponse([project]);
        if (url.endsWith('/cases')) return jsonResponse([]);
        if (
          url === `/api/projects/${project.id}` &&
          init?.method === 'DELETE'
        ) {
          if (failDelete)
            return new Response(
              JSON.stringify({
                error: {
                  code: 'TEST_ERROR',
                  message: '삭제를 완료하지 못했습니다.',
                  requestId: 'test',
                },
              }),
              { status: 500 },
            );
          return jsonResponse({
            ...project,
            status: 'archived',
            deletionMode: 'archive',
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      });
    renderProjectWorkspace();
    const row = await screen.findByRole('row', {
      name: /오른쪽 삭제 프로젝트/u,
    });
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    await screen.findByText('등록할 팀 선택');
    openProjectManagement();
    const remove = within(
      screen.getByRole('row', { name: /오른쪽 삭제 프로젝트/u }),
    ).getByRole('button', { name: '삭제' });
    expect(remove.querySelector('button')).toBeNull();
    remove.focus();
    fireEvent.click(remove);
    let dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(
      fetchSpy.mock.calls.filter(([, init]) => init?.method === 'DELETE'),
    ).toHaveLength(0);
    expect(screen.getByRole('combobox', { name: '현재 프로젝트' })).toHaveValue(
      project.id,
    );
    fireEvent.click(remove);
    dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    expect(
      await within(dialog).findByText('삭제를 완료하지 못했습니다.'),
    ).toBeVisible();
    expect(
      within(
        screen.getByRole('row', { name: /오른쪽 삭제 프로젝트/u }),
      ).getByRole('button', { name: '삭제' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '현재 프로젝트' })).toHaveValue(
      project.id,
    );
    failDelete = false;
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('row', { name: /오른쪽 삭제 프로젝트/u }),
      ).toBeNull(),
    );
    expect(screen.getByRole('combobox', { name: '현재 프로젝트' })).toHaveValue(
      '',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '새 프로젝트 등록' }),
      ).toHaveFocus(),
    );
  });

  it('does not expose a project delete action to a viewer in the right workspace', async () => {
    const project = {
      ...projectFixture('P1', '조회 전용 프로젝트'),
      role: 'viewer',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([project]));
    renderProjectWorkspace();
    const row = await screen.findByRole('row', { name: /조회 전용 프로젝트/u });
    expect(row).toBeVisible();
    expect(within(row).queryByRole('button', { name: /삭제/u })).toBeNull();
  });

  it('uses workflow project management and header selector without a redundant project picker', async () => {
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
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url === '/api/projects') return jsonResponse(projects);
      if (url.endsWith('/cases')) return jsonResponse([]);
      throw new Error(`Unexpected request: ${url}`);
    });

    renderProjectWorkspace();
    const p1 = await screen.findByRole('row', { name: /P1 프로젝트/u });
    fireEvent.click(
      within(p1).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    await screen.findByText('팀을 선택하면 바로 자료를 등록할 수 있습니다.');
    expect(screen.queryByText(/RAG STATUS/u)).toBeNull();
    expect(
      screen.queryByText('자료를 등록할 프로젝트를 선택하세요'),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText('현재 프로젝트'), {
      target: { value: projects[1].id },
    });

    expect(
      await screen.findByRole('region', { name: 'P2 프로젝트' }),
    ).toBeVisible();
    expect(screen.getByText('등록할 팀 선택')).toBeVisible();
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
    renderProjectWorkspace();
    expect(await screen.findByText('저장소를 열지 못했습니다.')).toBeVisible();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeVisible();
  });

  it('creates a team once and opens its upload form on repeated selection', async () => {
    const project = projectFixture('P100', '웹 검수 프로젝트');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
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
    renderProjectWorkspace();
    const row = await screen.findByRole('row', { name: /웹 검수 프로젝트/u });
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    await screen.findByText('팀을 선택하면 바로 자료를 등록할 수 있습니다.');
    fireEvent.click(screen.getByRole('button', { name: '마감팀' }));
    expect(
      await screen.findByText('웹 검수 프로젝트 마감 검수 1'),
    ).toBeVisible();
    expect(screen.getByText('초안')).toBeVisible();
    expect(screen.getByText('산출서와 집계표 원본 등록')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '마감팀' }));
    expect(
      fetchSpy.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
  });

  it('keeps legacy same-team records selectable and permits partial stored sources', async () => {
    const project = projectFixture('P100', '팀 기록 프로젝트');
    const records = [
      caseFixture(project.id, '마감 이전 기록 2'),
      caseFixture(project.id, '마감 이전 기록 1'),
    ];
    const partial = sourcePackageFixture({
      projectId: project.id,
      reviewCaseId: records[0].id,
      status: 'stored',
    });
    partial.status = 'receiving';
    partial.files.push({
      ...partial.files[0],
      uploadId: crypto.randomUUID(),
      sourceFileId: crypto.randomUUID(),
      sourceVersionId: crypto.randomUUID(),
      filename: '외부산출서.csv',
      status: 'upload_pending',
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url === '/api/projects') return jsonResponse([project]);
        if (url.endsWith('/cases')) return jsonResponse(records);
        if (url.includes(records[0].id)) return jsonResponse([partial]);
        if (url.includes(records[1].id)) return jsonResponse([]);
        throw new Error(`Unexpected request: ${url}`);
      });
    renderProjectWorkspace();
    const row = await screen.findByRole('row', { name: /팀 기록 프로젝트/u });
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '마감팀' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: '마감팀' }));
    const history = screen.getByRole('combobox', { name: '이전 자료 기록' });
    expect(within(history).getAllByRole('option')).toHaveLength(2);
    expect(
      await screen.findByRole('heading', {
        name: '1개 등록 완료',
      }),
    ).toBeVisible();
    const workflow = screen.getByRole('navigation', { name: '작업 순서' });
    expect(
      within(workflow).getByRole('button', { name: /산출식 AI 검수/u }),
    ).toBeEnabled();
    fireEvent.change(history, { target: { value: records[1].id } });
    await waitFor(() =>
      expect(
        screen.queryByText('저장된 자료로 다음 단계 진행 가능'),
      ).toBeNull(),
    );
    expect(
      within(workflow).getByRole('button', { name: /산출식 AI 검수/u }),
    ).toBeDisabled();
    expect(
      fetchSpy.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(0);
  });

  it('asks once before switching to a new team and preserves selection if creation fails', async () => {
    const project = projectFixture('P100', '팀 전환 프로젝트');
    const initialCase = caseFixture(project.id, '마감팀 자료');
    const newCase = {
      ...caseFixture(project.id, '구조팀 자료'),
      discipline: 'RC' as const,
    };
    let failCreation = true;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = requestUrl(input);
      if (url === '/api/projects') return jsonResponse([project]);
      if (url.endsWith('/cases') && init?.method === 'POST') {
        if (failCreation)
          return new Response(
            JSON.stringify({
              error: {
                code: 'TEST_ERROR',
                message: '팀 생성 실패',
                requestId: 'test',
              },
            }),
            { status: 500 },
          );
        return jsonResponse(newCase, 201);
      }
      if (url.endsWith('/cases')) return jsonResponse([initialCase]);
      return jsonResponse([]);
    });
    renderProjectWorkspace();
    const row = await screen.findByRole('row', { name: /팀 전환 프로젝트/u });
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '마감팀' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: '마감팀' }));
    fireEvent.change(document.querySelector('#source-files')!, {
      target: {
        files: [new File(['sample'], '미저장자료.csv', { type: 'text/csv' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '구조팀' }));
    await screen.findByText('팀 생성 실패');
    expect(
      screen.getByText('미저장자료.csv', {
        selector: '.source-file-list span',
      }),
    ).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
    failCreation = false;
    confirm.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '구조팀' }));
    expect(await screen.findByText('구조팀 자료')).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.source-file-list')).toBeNull();
    expect(screen.getByText('산출서와 집계표 원본 등록')).toBeVisible();
  });

  it('places the only review shortcut before every upload control, including busy and empty states', () => {
    const project = projectFixture('P1', '상단 검수 버튼 확인');
    const reviewCase = caseFixture(project.id, '마감팀');
    const props = {
      selectedProject: project,
      reviewCases: [reviewCase],
      caseState: 'ready',
      canUpload: true,
      caseSubmitting: false,
      uploadCaseId: reviewCase.id,
      sourceFiles: [],
      uploadMode: 'append',
      onUploadModeChange: vi.fn(),
      onApplyReplacement: vi.fn(),
      uploading: false,
      uploadProgress: '',
      uploadStatus: 'idle',
      uploadCompletedCount: 0,
      uploadFailures: [],
      sourcePackages: [
        sourcePackageFixture({
          projectId: project.id,
          reviewCaseId: reviewCase.id,
          status: 'stored',
        }),
      ],
      sourcePackageState: 'ready',
      sourcePackageError: '',
      deletingSourcePackageId: null,
      message: '',
      messageTone: 'neutral',
      onOpenRegistration: vi.fn(),
      onRetryCases: vi.fn(),
      onCreateCase: vi.fn(),
      onOpenUpload: vi.fn(),
      onCloseUpload: vi.fn(),
      onFilesChange: vi.fn(),
      onRetryPackages: vi.fn(),
      onArchiveSourcePackage: vi.fn(),
      onContinueToAiReview: vi.fn(),
      onUpload: vi.fn(),
    } satisfies ComponentProps<typeof ProjectDataWorkspace>;
    const { rerender } = render(<ProjectDataWorkspace {...props} />);
    for (const [sourcePackageState, uploading, enabled] of [
      ['ready', false, true],
      ['ready', true, false],
      ['loading', false, false],
      ['error', false, false],
    ] as const) {
      rerender(
        <ProjectDataWorkspace
          {...props}
          sourcePackageState={sourcePackageState}
          uploading={uploading}
        />,
      );
      const actions = screen.getAllByRole('button', {
        name: /STEP 2 · AI 검수 시작/u,
      });
      expect(actions).toHaveLength(1);
      const topPanel = screen.getByRole('group', {
        name: '자료 등록 상단 작업',
      });
      expect(
        document.querySelector('.source-upload-panel')?.firstElementChild,
      ).toBe(topPanel);
      expect(
        topPanel.compareDocumentPosition(
          screen.getByLabelText(/산출서와 집계표 선택/u),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        topPanel.compareDocumentPosition(
          document.querySelector('.source-package-history')!,
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      for (const action of actions) {
        expect(action).toHaveAttribute('type', 'button');
        if (enabled) expect(action).toBeEnabled();
        else expect(action).toBeDisabled();
        fireEvent.click(action);
      }
    }
    expect(props.onContinueToAiReview).toHaveBeenCalledTimes(1);
    expect(props.onUpload).not.toHaveBeenCalled();
    rerender(<ProjectDataWorkspace {...props} sourcePackages={[]} />);
    expect(
      screen.queryAllByRole('button', { name: /STEP 2 · AI 검수 시작/u }),
    ).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: /STEP 2 · AI 검수 시작/u }),
    ).toBeDisabled();
  });

  it('stores source files, verifies the persisted package, and keeps the exact result visible', async () => {
    const project = projectFixture('P100', '웹 검수 프로젝트');
    const reviewCase = caseFixture(project.id, '웹 검수 프로젝트 마감 검수 1');
    const packageId = '33333333-3333-4333-8333-333333333333';
    const uploadId = '44444444-4444-4444-8444-444444444444';
    const sourceFileId = '55555555-5555-4555-8555-555555555555';
    const sourceVersionId = '66666666-6666-4666-8666-666666666666';
    let packageListCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = requestUrl(input);
      if (url === '/api/projects') {
        return jsonResponse([project]);
      }
      if (url === `/api/projects/${project.id}/cases`) {
        return jsonResponse([reviewCase]);
      }
      if (
        url ===
          `/api/projects/${project.id}/cases/${reviewCase.id}/source-packages` &&
        init?.method === 'POST'
      ) {
        return jsonResponse(
          [
            sourcePackageFixture({
              packageId,
              projectId: project.id,
              reviewCaseId: reviewCase.id,
              uploadId,
              sourceFileId,
              sourceVersionId,
              status: 'upload_pending',
            }),
          ][0],
          201,
        );
      }
      if (
        url ===
        `/api/projects/${project.id}/cases/${reviewCase.id}/source-packages`
      ) {
        packageListCalls += 1;
        return jsonResponse(
          packageListCalls === 1
            ? []
            : [
                sourcePackageFixture({
                  packageId,
                  projectId: project.id,
                  reviewCaseId: reviewCase.id,
                  uploadId,
                  sourceFileId,
                  sourceVersionId,
                  status: 'stored',
                }),
              ],
        );
      }
      if (url === `/api/uploads/${uploadId}/bytes`) {
        return jsonResponse({
          uploadId,
          packageId,
          sourceVersionId,
          filename: '내부산출서.csv',
          status: 'stored',
          packageStatus: 'stored_unverified',
          projectIdentityStatus: 'pending',
          sha256: 'a'.repeat(64),
          sizeBytes: 20,
          warnings: [],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    renderProjectWorkspace();
    const row = await screen.findByRole('row', { name: /웹 검수 프로젝트/u });
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    const registerButton = await screen.findByRole('button', {
      name: '마감팀',
    });
    fireEvent.click(registerButton);
    expect(
      await screen.findByText(
        '이 팀에 저장된 산출서와 집계표가 아직 없습니다.',
      ),
    ).toBeVisible();
    const file = new File(['a,b\nc,1\n'], '내부산출서.csv', {
      type: 'text/csv',
    });
    fireEvent.change(screen.getByLabelText(/산출서와 집계표 선택/u), {
      target: { files: [file] },
    });
    const submitUpload = screen.getByRole('button', {
      name: '선택 파일 저장',
    });
    await waitFor(() => expect(submitUpload).toBeEnabled());
    fireEvent.submit(submitUpload.closest('form')!);

    await waitFor(() =>
      expect(
        document.querySelector('.source-upload-progress'),
      ).toHaveTextContent('1개 등록 완료'),
    );
    expect(screen.getAllByText('등록 완료')[0]).toBeVisible();
    expect(screen.getByText('1/1개 저장', { exact: false })).toBeVisible();
    expect(screen.getAllByText('내부산출서.csv').length).toBeGreaterThan(0);
    const continueActions = screen.getAllByRole('button', {
      name: /STEP 2 · AI 검수 시작/u,
    });
    expect(continueActions).toHaveLength(1);
    for (const action of continueActions) {
      expect(action).toBeVisible();
      expect(action).toBeEnabled();
      expect(action).toHaveAttribute('type', 'button');
    }
    const topActions = screen.getByRole('group', {
      name: '자료 등록 상단 작업',
    });
    fireEvent.click(
      within(topActions).getByRole('button', {
        name: /STEP 2 · AI 검수 시작/u,
      }),
    );
    const aiChooser = screen.getByRole('navigation', {
      name: '작업 순서',
    });
    expect(
      within(aiChooser).getByRole('button', { name: /산출식 AI 검수/u }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(aiChooser).getByRole('button', { name: /중복 ITEM 검수/u }),
    ).toBeVisible();
    expect(packageListCalls).toBe(2);
  });

  it.each([true, false])(
    'confirms replacement once and activates only after every file is stored (success: %s)',
    async (succeeds) => {
      const project = projectFixture('TEST', '교체 테스트');
      const reviewCase = caseFixture(project.id, '교체 테스트 마감팀');
      const old = {
        ...sourcePackageFixture({
          projectId: project.id,
          reviewCaseId: reviewCase.id,
          status: 'stored',
        }),
        displayName: '이전 자료',
      };
      const targets = [{ id: old.id, version: old.version }];
      const next: SourcePackageSummary = {
        ...sourcePackageFixture({
          projectId: project.id,
          reviewCaseId: reviewCase.id,
          packageId: crypto.randomUUID(),
          status: 'upload_pending',
        }),
        displayName: '수정 자료',
        replaces: targets,
        replacementAppliedAt: null,
      };
      let created = false;
      let stored = false;
      let applied = false;
      const base = `/api/projects/${project.id}/cases/${reviewCase.id}/source-packages`;
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input, init) => {
          const url = requestUrl(input);
          if (url === '/api/projects') return jsonResponse([project]);
          if (url.endsWith('/cases')) return jsonResponse([reviewCase]);
          if (url === base && init?.method === 'POST') {
            expect(JSON.parse(init.body as string).replaces).toEqual(targets);
            created = true;
            return jsonResponse(next, 201);
          }
          if (url === base)
            return jsonResponse([
              { ...old, supersededBy: applied ? next.id : null },
              ...(created
                ? [
                    {
                      ...next,
                      status: stored ? 'stored_unverified' : 'receiving',
                      replacementAppliedAt: applied
                        ? new Date().toISOString()
                        : null,
                      files: next.files.map((file) => ({
                        ...file,
                        status: stored ? 'stored' : 'upload_pending',
                      })),
                    },
                  ]
                : []),
            ]);
          if (url === `/api/uploads/${next.files[0].uploadId}/bytes`) {
            stored = succeeds;
            return succeeds
              ? jsonResponse({ status: 'stored' })
              : new Response(
                  JSON.stringify({
                    error: {
                      code: 'UPLOAD_FAILED',
                      message: '합성 업로드 실패',
                      requestId: 'test',
                    },
                  }),
                  { status: 503 },
                );
          }
          if (url === `${base}/${next.id}` && init?.method === 'POST') {
            expect(stored).toBe(true);
            expect(init.headers).toMatchObject({ 'if-match': '"1"' });
            applied = true;
            return jsonResponse({ id: next.id, applied: true });
          }
          throw new Error(`Unexpected request: ${url}`);
        });
      renderProjectWorkspace();
      fireEvent.click(
        within(
          await screen.findByRole('row', { name: /교체 테스트/u }),
        ).getByRole('button', { name: '선택하고 자료 등록' }),
      );
      fireEvent.click(await screen.findByRole('button', { name: '마감팀' }));
      fireEvent.click(screen.getByText('등록 옵션 · 기존 자료 교체'));
      const mode = await screen.findByRole('radio', { name: '기존 자료 교체' });
      await waitFor(() => expect(mode).toBeEnabled());
      fireEvent.click(mode);
      fireEvent.change(screen.getByLabelText(/산출서와 집계표 선택/u), {
        target: {
          files: [
            new File(['a,b\nc,1\n'], '내부산출서.csv', { type: 'text/csv' }),
          ],
        },
      });
      const submit = screen.getByRole('button', { name: '선택 파일 저장' });
      fireEvent.submit(submit.closest('form')!);
      expect(created).toBe(false);
      expect(confirm).toHaveBeenCalledTimes(1);
      confirm.mockReturnValue(true);
      fireEvent.submit(submit.closest('form')!);
      await waitFor(() =>
        expect(
          document.querySelector('.source-upload-progress'),
        ).toHaveTextContent(
          succeeds ? '1개 등록 완료' : '교체 미적용, 기존 자료 유지',
        ),
      );
      expect(applied).toBe(succeeds);
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(
        fetchSpy.mock.calls.filter(
          ([input, init]) =>
            requestUrl(input) === base && init?.method === 'POST',
        ),
      ).toHaveLength(1);
      if (succeeds) {
        const history = screen
          .getByText(/교체된 이전 자료/u)
          .closest('details')!;
        expect(history).not.toHaveAttribute('open');
        expect(within(history).getByText('이전 자료')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '교체 적용' })).toBeNull();
      } else {
        expect(screen.getByText('교체 대기 · 기존 자료 유지')).toBeVisible();
        expect(screen.queryByText(/교체된 이전 자료/u)).toBeNull();
      }
      expect(
        within(
          screen.getByRole('group', { name: '자료 등록 상단 작업' }),
        ).getByRole('button', { name: /STEP 2 · AI 검수 시작/u }),
      ).toBeEnabled();
    },
  );

  it('keeps a failed source selection retryable and reports the exact saved count', async () => {
    const project = projectFixture('P100', '웹 검수 프로젝트');
    const reviewCase = caseFixture(project.id, '웹 검수 프로젝트 마감 검수 1');
    const packageSummary = sourcePackageFixture({
      projectId: project.id,
      reviewCaseId: reviewCase.id,
      status: 'upload_pending',
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = requestUrl(input);
      if (url === '/api/projects') return jsonResponse([project]);
      if (url === `/api/projects/${project.id}/cases`)
        return jsonResponse([reviewCase]);
      if (
        url ===
          `/api/projects/${project.id}/cases/${reviewCase.id}/source-packages` &&
        init?.method === 'POST'
      )
        return jsonResponse(packageSummary, 201);
      if (
        url ===
        `/api/projects/${project.id}/cases/${reviewCase.id}/source-packages`
      )
        return jsonResponse([]);
      if (url === `/api/uploads/${packageSummary.files[0].uploadId}/bytes`) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'UPLOAD_FAILED',
              message: '원본 저장소에 연결하지 못했습니다.',
              requestId: 'r-upload',
            },
          }),
          { status: 503 },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    renderProjectWorkspace();
    const row = await screen.findByRole('row', { name: /웹 검수 프로젝트/u });
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: '마감팀' }));
    await screen.findByText('이 팀에 저장된 산출서와 집계표가 아직 없습니다.');
    const file = new File(['a,b\nc,1\n'], '내부산출서.csv', {
      type: 'text/csv',
    });
    fireEvent.change(screen.getByLabelText(/산출서와 집계표 선택/u), {
      target: { files: [file] },
    });
    const retryableSubmit = screen.getByRole('button', {
      name: '선택 파일 저장',
    });
    await waitFor(() => expect(retryableSubmit).toBeEnabled());
    fireEvent.submit(retryableSubmit.closest('form')!);

    await waitFor(() =>
      expect(
        document.querySelector('.source-upload-progress'),
      ).toHaveTextContent('0/1개 서버 저장 완료'),
    );
    expect(
      screen.getByText('원본 저장소에 연결하지 못했습니다.'),
    ).toBeVisible();
    expect(screen.getAllByText('내부산출서.csv').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: '선택 파일 저장' }),
    ).toBeEnabled();
  });

  it('removes a failed source package from the normal list after one confirmation', async () => {
    const project = projectFixture('P100', '웹 검수 프로젝트');
    const reviewCase = caseFixture(project.id, '웹 검수 프로젝트 마감 검수 1');
    const failedPackage = sourcePackageFixture({
      projectId: project.id,
      reviewCaseId: reviewCase.id,
      status: 'upload_pending',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = requestUrl(input);
      if (url === '/api/projects') return jsonResponse([project]);
      if (url === `/api/projects/${project.id}/cases`)
        return jsonResponse([reviewCase]);
      if (
        url ===
          `/api/projects/${project.id}/cases/${reviewCase.id}/source-packages` &&
        !init?.method
      )
        return jsonResponse([failedPackage]);
      if (
        url ===
          `/api/projects/${project.id}/cases/${reviewCase.id}/source-packages/${failedPackage.id}` &&
        init?.method === 'DELETE'
      )
        return jsonResponse({
          id: failedPackage.id,
          status: 'aborted',
          deletionMode: 'archive',
        });
      throw new Error(`Unexpected request: ${url}`);
    });

    renderProjectWorkspace();
    const row = await screen.findByRole('row', { name: /웹 검수 프로젝트/u });
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: '마감팀' }));
    const packageList = await screen.findByRole('list', {
      name: /웹 검수 프로젝트 산출서와 집계표/u,
    });
    fireEvent.click(
      within(packageList.closest('li')!).getByRole('button', { name: '삭제' }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/등록 자료 묶음을 목록에서 삭제했습니다/u),
      ).toBeVisible(),
    );
    expect(
      screen.getByText('이 팀에 저장된 산출서와 집계표가 아직 없습니다.'),
    ).toBeVisible();
  });

  it.each([false, true])(
    'reconciles partial upload against server state (committed despite response loss: %s)',
    async (committed) => {
      const project = projectFixture('P100', '웹 검수 프로젝트');
      const reviewCase = caseFixture(
        project.id,
        '웹 검수 프로젝트 마감 검수 1',
      );
      const packageId = '33333333-3333-4333-8333-333333333333';
      const blockedUploadId = '44444444-4444-4444-8444-444444444444';
      const storedUploadId = '77777777-7777-4777-8777-777777777777';
      const pendingPackage = {
        ...sourcePackageFixture({
          packageId,
          projectId: project.id,
          reviewCaseId: reviewCase.id,
          uploadId: blockedUploadId,
          status: 'upload_pending',
        }),
        files: [
          {
            uploadId: blockedUploadId,
            sourceFileId: crypto.randomUUID(),
            sourceVersionId: crypto.randomUUID(),
            filename: '가설산출서.xlsx',
            format: 'xlsx' as const,
            documentKind: 'takeoff' as const,
            sizeBytes: 4,
            status: 'upload_pending' as const,
          },
          {
            uploadId: storedUploadId,
            sourceFileId: crypto.randomUUID(),
            sourceVersionId: crypto.randomUUID(),
            filename: '공용집계표.csv',
            format: 'csv' as const,
            documentKind: 'summary' as const,
            sizeBytes: 8,
            status: 'upload_pending' as const,
          },
        ],
      };
      let packageListCalls = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = requestUrl(input);
        if (url === '/api/projects') return jsonResponse([project]);
        if (url === `/api/projects/${project.id}/cases`)
          return jsonResponse([reviewCase]);
        if (
          url ===
            `/api/projects/${project.id}/cases/${reviewCase.id}/source-packages` &&
          init?.method === 'POST'
        )
          return jsonResponse(pendingPackage, 201);
        if (
          url ===
          `/api/projects/${project.id}/cases/${reviewCase.id}/source-packages`
        ) {
          packageListCalls += 1;
          return jsonResponse(
            packageListCalls === 1
              ? []
              : [
                  {
                    ...pendingPackage,
                    files: [
                      {
                        ...pendingPackage.files[0],
                        ...(committed ? { status: 'stored' } : {}),
                        uploadState: 'failed',
                        errorCode: 'FILE_XLSX_ACTIVE_CONTENT',
                      },
                      { ...pendingPackage.files[1], status: 'stored' },
                    ],
                  },
                ],
          );
        }
        if (url === `/api/uploads/${blockedUploadId}/bytes`) {
          if (committed)
            return new Response('Worker exceeded resource limits', {
              status: 503,
            });
          return new Response(
            JSON.stringify({
              error: {
                code: 'FILE_XLSX_ACTIVE_CONTENT',
                message:
                  '실행 가능한 포함 개체가 있어 이 파일을 저장하지 않았습니다.',
                requestId: 'r-blocked',
              },
            }),
            { status: 400 },
          );
        }
        if (url === `/api/uploads/${storedUploadId}/bytes`) {
          return jsonResponse({
            uploadId: storedUploadId,
            packageId,
            filename: '공용집계표.csv',
            status: 'stored',
            packageStatus: 'stored_unverified',
            projectIdentityStatus: 'pending',
            sha256: 'a'.repeat(64),
            sizeBytes: 8,
            warnings: [],
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      renderProjectWorkspace();
      const row = await screen.findByRole('row', { name: /웹 검수 프로젝트/u });
      fireEvent.click(
        within(row).getByRole('button', { name: '선택하고 자료 등록' }),
      );
      fireEvent.click(await screen.findByRole('button', { name: '마감팀' }));
      await screen.findByText(
        '이 팀에 저장된 산출서와 집계표가 아직 없습니다.',
      );
      const files = [
        new File(['xlsx'], '가설산출서.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        new File(['a,b\nc,1\n'], '공용집계표.csv', { type: 'text/csv' }),
      ];
      fireEvent.change(screen.getByLabelText(/산출서와 집계표 선택/u), {
        target: { files },
      });
      const submit = screen.getByRole('button', { name: '선택 파일 저장' });
      await waitFor(() => expect(submit).toBeEnabled());
      fireEvent.submit(submit.closest('form')!);

      if (committed) {
        await screen.findByText(
          /2개 산출서와 집계표를 저장하고 서버 목록에서 확인했습니다/u,
        );
        expect(screen.queryByText('저장하지 못한 파일')).toBeNull();
        expect(screen.queryByText(/UPLOAD_HTTP_503/u)).toBeNull();
        return;
      }
      await waitFor(() =>
        expect(
          document.querySelector('.source-upload-progress'),
        ).toHaveTextContent('1/2개 서버 저장 완료'),
      );
      expect(screen.getByText('저장하지 못한 파일')).toBeVisible();
      expect(screen.getAllByText('가설산출서.xlsx').length).toBeGreaterThan(0);
      expect(
        screen.getAllByText(/FILE_XLSX_ACTIVE_CONTENT/u).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText(/실행 가능한 포함 개체/u).length,
      ).toBeGreaterThan(0);
      expect(screen.getAllByText('공용집계표.csv').length).toBeGreaterThan(0);
    },
  );

  it('routes finish and structure menus without presenting unimplemented analysis as completed', async () => {
    const project = projectFixture('P100', '웹 검수 프로젝트');
    const reviewCase = caseFixture(project.id, '웹 검수 프로젝트 마감 검수 1');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url === '/api/projects') return jsonResponse([project]);
      if (url === `/api/projects/${project.id}/cases`)
        return jsonResponse([reviewCase]);
      if (
        url ===
        `/api/projects/${project.id}/cases/${reviewCase.id}/source-packages`
      )
        return jsonResponse([
          sourcePackageFixture({
            projectId: project.id,
            reviewCaseId: reviewCase.id,
            status: 'stored',
          }),
        ]);
      throw new Error(`Unexpected request: ${url}`);
    });
    renderProjectWorkspace();
    const row = await screen.findByRole('row', { name: /웹 검수 프로젝트/u });
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: '마감팀' }));
    await screen.findAllByText('등록 완료');
    const workflow = screen.getByRole('navigation', { name: '작업 순서' });
    fireEvent.click(
      within(workflow).getByRole('button', { name: '분석표 개요' }),
    );
    expect(
      screen.getByRole('button', { name: 'Excel 다운로드' }),
    ).toBeDisabled();
    expect(screen.getByText('N/A · 원천 미등록')).toBeVisible();
    const finishGroup = within(workflow)
      .getByText('마감', { selector: 'summary' })
      .closest('details');
    const structureGroup = within(workflow)
      .getByText('구조', { selector: 'summary' })
      .closest('details');
    expect(finishGroup).not.toHaveAttribute('open');
    expect(structureGroup).not.toHaveAttribute('open');
    fireEvent.click(
      within(workflow).getByText('마감', { selector: 'summary' }),
    );
    for (const label of ['내부', '외부', '조적', '창호']) {
      const button = within(workflow).getByRole('button', { name: label });
      expect(button).toBeEnabled();
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-current', 'page');
      expect(finishGroup).toHaveAttribute('open');
      expect(structureGroup).not.toHaveAttribute('open');
      if (label === '조적')
        expect(screen.getByText('SYSTEM_HARD_RULE · 계산 제외')).toBeVisible();
      else expect(screen.getByText('N/A · 미실행')).toBeVisible();
    }
    fireEvent.click(
      within(workflow).getByText('구조', { selector: 'summary' }),
    );
    for (const label of ['보', '아파트옹벽', '아파트슬라브']) {
      const button = within(workflow).getByRole('button', { name: label });
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-current', 'page');
      expect(
        screen.getByRole('heading', { name: `구조 · ${label} 공종별 분석표` }),
      ).toBeVisible();
      expect(structureGroup).toHaveAttribute('open');
      expect(finishGroup).not.toHaveAttribute('open');
      expect(screen.getByText('N/A · 미실행')).toBeVisible();
      expect(
        screen.queryByRole('button', { name: /실행|다운로드/u }),
      ).toBeNull();
    }
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
    renderProjectWorkspace();
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
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '마감팀' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: '마감팀' }));
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

function openProjectManagement() {
  fireEvent.click(
    within(screen.getByRole('navigation', { name: '작업 순서' })).getByRole(
      'button',
      { name: /^프로젝트$/u },
    ),
  );
}

function renderProjectWorkspace() {
  const result = renderStudio();
  openProjectManagement();
  return result;
}

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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data, requestId: 'req-test' }), {
    status,
  });
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

function sourcePackageFixture({
  packageId = '33333333-3333-4333-8333-333333333333',
  projectId,
  reviewCaseId,
  uploadId = '44444444-4444-4444-8444-444444444444',
  sourceFileId = '55555555-5555-4555-8555-555555555555',
  sourceVersionId = '66666666-6666-4666-8666-666666666666',
  sizeBytes = 8,
  status,
}: {
  packageId?: string;
  projectId: string;
  reviewCaseId: string;
  uploadId?: string;
  sourceFileId?: string;
  sourceVersionId?: string;
  sizeBytes?: number;
  status: 'upload_pending' | 'stored';
}) {
  return {
    id: packageId,
    version: 1,
    projectId,
    reviewCaseId,
    displayName: '웹 검수 프로젝트 산출서와 집계표',
    status:
      status === 'stored'
        ? ('stored_unverified' as const)
        : ('receiving' as const),
    projectIdentityStatus: 'pending' as const,
    files: [
      {
        uploadId,
        sourceFileId,
        sourceVersionId,
        filename: '내부산출서.csv',
        format: 'csv' as const,
        documentKind: 'takeoff' as const,
        sizeBytes,
        status,
      },
    ],
    createdAt: '2026-09-02T00:00:00.000Z',
  };
}
