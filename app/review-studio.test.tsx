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
    fireEvent.click(screen.getByRole('button', { name: '마감팀' }));
    expect(
      await screen.findByText('웹 검수 프로젝트 마감 검수 1'),
    ).toBeVisible();
    expect(screen.getByText('초안')).toBeVisible();
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

    renderStudio();
    const row = await screen.findByRole('row', { name: /웹 검수 프로젝트/u });
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    const registerButton = await screen.findByRole('button', {
      name: '산출서와 집계표 등록',
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
      name: '원본 검사 후 저장',
    });
    await waitFor(() => expect(submitUpload).toBeEnabled());
    fireEvent.submit(submitUpload.closest('form')!);

    await waitFor(() =>
      expect(
        document.querySelector('.source-upload-progress'),
      ).toHaveTextContent(
        '1/1개 파일 저장 완료 · 서버 자료 묶음에서 확인했습니다.',
      ),
    );
    expect(screen.getByText('원본 저장 완료')).toBeVisible();
    expect(screen.getByText('1/1개 저장 ·', { exact: false })).toBeVisible();
    expect(screen.getByText('내부산출서.csv')).toBeVisible();
    expect(packageListCalls).toBe(2);
  });

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

    renderStudio();
    const row = await screen.findByRole('row', { name: /웹 검수 프로젝트/u });
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: '산출서와 집계표 등록' }),
    );
    await screen.findByText('이 팀에 저장된 산출서와 집계표가 아직 없습니다.');
    const file = new File(['a,b\nc,1\n'], '내부산출서.csv', {
      type: 'text/csv',
    });
    fireEvent.change(screen.getByLabelText(/산출서와 집계표 선택/u), {
      target: { files: [file] },
    });
    const retryableSubmit = screen.getByRole('button', {
      name: '원본 검사 후 저장',
    });
    await waitFor(() => expect(retryableSubmit).toBeEnabled());
    fireEvent.submit(retryableSubmit.closest('form')!);

    await waitFor(() =>
      expect(
        document.querySelector('.source-upload-progress'),
      ).toHaveTextContent('0/1개 서버 저장 확인'),
    );
    expect(
      screen.getByText('원본 저장소에 연결하지 못했습니다.'),
    ).toBeVisible();
    expect(screen.getByText('내부산출서.csv')).toBeVisible();
    expect(
      screen.getByRole('button', { name: '원본 검사 후 다시 저장' }),
    ).toBeEnabled();
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
