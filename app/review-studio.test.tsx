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
  it('uses the official title, project sidebar, three-step workflow, and source wording', async () => {
    mockProjects([]);
    renderStudio();
    expect(
      screen.getByText('CONCOST 기술본부 QC 스튜디오', {
        selector: '.topbar-title strong',
      }),
    ).toBeVisible();
    const navigation = screen.getByRole('navigation', { name: '프로젝트' });
    expect(within(navigation).getByText('새 프로젝트')).toBeVisible();
    expect(within(navigation).getByText('프로젝트 목록')).toBeVisible();
    expect(within(navigation).getByText('설정')).toBeVisible();
    const workflow = screen.getByRole('region', { name: '검수 진행 단계' });
    expect(within(workflow).getByText(/STEP 1 · 자료 등록/u)).toBeVisible();
    expect(within(workflow).getByText(/STEP 2 · AI 검수/u)).toBeVisible();
    expect(
      within(workflow).getByText(/STEP 3 · 수량산출 분석표/u),
    ).toBeVisible();
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
      screen.getByRole('button', { name: '새 프로젝트 등록' }),
    ).toBeVisible();
    expect(screen.getByText('PROJECT SELECTOR · RAG STATUS')).toBeVisible();
    expect(screen.getByLabelText('전체 프로젝트 목록')).toBeVisible();
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

    renderStudio();
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

  it('supports both search and dropdown selection without changing the project before confirmation', async () => {
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

    renderStudio();
    const p1 = await screen.findByRole('row', { name: /P1 프로젝트/u });
    fireEvent.click(
      within(p1).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    await screen.findByText('먼저 팀별 검수 케이스를 만드세요.');

    fireEvent.change(screen.getByLabelText('전체 프로젝트 목록'), {
      target: { value: projects[1].id },
    });
    expect(screen.getByText('프로젝트 변경을 먼저 확정하세요.')).toBeVisible();
    expect(screen.queryByText('팀별 검수 케이스')).toBeNull();

    fireEvent.change(screen.getByLabelText('프로젝트 검색'), {
      target: { value: 'P2' },
    });
    expect(screen.getByText('검색 결과 1개')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '이 프로젝트로 진행' }));

    expect(
      await screen.findByRole('region', { name: 'P2 프로젝트' }),
    ).toBeVisible();
    expect(screen.getByText('팀별 검수 케이스')).toBeVisible();
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
    expect(screen.getAllByText('내부산출서.csv').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: /STEP 2 · AI 검수 시작/u }),
    ).toBeVisible();
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
      ).toHaveTextContent('0/1개 서버 저장 완료'),
    );
    expect(
      screen.getByText('원본 저장소에 연결하지 못했습니다.'),
    ).toBeVisible();
    expect(screen.getAllByText('내부산출서.csv').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: '원본 검사 후 다시 저장' }),
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

    renderStudio();
    const row = await screen.findByRole('row', { name: /웹 검수 프로젝트/u });
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: '산출서와 집계표 등록' }),
    );
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

  it('continues after one blocked workbook and stores the remaining files', async () => {
    const project = projectFixture('P100', '웹 검수 프로젝트');
    const reviewCase = caseFixture(project.id, '웹 검수 프로젝트 마감 검수 1');
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

    renderStudio();
    const row = await screen.findByRole('row', { name: /웹 검수 프로젝트/u });
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: '산출서와 집계표 등록' }),
    );
    await screen.findByText('이 팀에 저장된 산출서와 집계표가 아직 없습니다.');
    const files = [
      new File(['xlsx'], '가설산출서.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      new File(['a,b\nc,1\n'], '공용집계표.csv', { type: 'text/csv' }),
    ];
    fireEvent.change(screen.getByLabelText(/산출서와 집계표 선택/u), {
      target: { files },
    });
    const submit = screen.getByRole('button', { name: '원본 검사 후 저장' });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.submit(submit.closest('form')!);

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
  });

  it('keeps overview and structure analysis disabled while finish analysis is available', async () => {
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
    renderStudio();
    const row = await screen.findByRole('row', { name: /웹 검수 프로젝트/u });
    fireEvent.click(
      within(row).getByRole('button', { name: '선택하고 자료 등록' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: '산출서와 집계표 등록' }),
    );
    await screen.findByText('원본 저장 완료');
    fireEvent.click(
      screen.getByRole('button', { name: /STEP 3 · 수량산출 분석표/u }),
    );

    expect(screen.getByRole('button', { name: /분석표 개요/u })).toBeDisabled();
    expect(screen.getByRole('button', { name: /구조팀/u })).toBeDisabled();
    for (const label of [
      '마감 · 내부',
      '마감 · 외부',
      '마감 · 조적',
      '마감 · 창호',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeEnabled();
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
