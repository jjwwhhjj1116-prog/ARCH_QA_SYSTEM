import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync('desktop/ui/index.html', 'utf8');
const script = readFileSync('desktop/ui/app.js', 'utf8');
const ok = (data: unknown) => ({ data });
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const result = () => ({
  runId: 'private-run',
  files: [{ filename: 'test.csv' }],
  findingCount: 1,
  findings: [
    {
      ruleId: 'QTY-001',
      level: 'A',
      title: '검토 후보',
      rowId: 'r1',
      evidence: ['비교 근거 2 × 3'],
      limitation: '승인 전',
    },
  ],
  limitations: ['이전 실행 제한'],
});
it('refreshes member and projects after main confirms login without manual click', async () => {
  await api.onAuthenticated.mock.calls[0][0]();
  expect(api.session).toHaveBeenCalledOnce();
  expect(api.projects).toHaveBeenCalledOnce();
  expect(el('member').textContent).toBe('시험 회원');
});
let api: Record<string, ReturnType<typeof vi.fn>>;
const el = (id: string) => document.getElementById(id)!;
async function click(id: string) {
  await el(id).onclick?.call(el(id), new MouseEvent('click') as PointerEvent);
}
async function prepared() {
  await click('refresh');
  (el('projects') as unknown as HTMLSelectElement).value = 'p1';
  el('projects').dispatchEvent(new Event('change'));
  await click('choose');
}
beforeEach(() => {
  document.documentElement.innerHTML = html;
  api = Object.fromEntries(
    [
      'session',
      'projects',
      'choose',
      'cloudSources',
      'importSource',
      'review',
      'logout',
      'cancel',
      'login',
      'export',
      'onProgress',
      'onAuthenticated',
      'createProject',
    ].map((name) => [name, vi.fn()]),
  );
  api.session.mockResolvedValue(
    ok({ email: 'member@test.invalid', displayName: '시험 회원' }),
  );
  api.projects.mockResolvedValue(ok([{ id: 'p1', name: '시험 프로젝트' }]));
  api.createProject.mockResolvedValue(ok({ id: 'p2', name: '새 현장' }));
  api.choose.mockResolvedValue(
    ok([{ id: 'f1', filename: 'test.csv', size: 20 }]),
  );
  api.review.mockResolvedValue(ok(result()));
  api.logout.mockResolvedValue(ok({}));
  api.cancel.mockResolvedValue(ok({}));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  api.cloudSources.mockResolvedValue(
    ok({
      cases: [{ id: 'c1', name: '마감팀 자료' }],
      caseId: 'c1',
      files: [
        {
          packageId: 'pkg1',
          sourceVersionId: 's1',
          filename: 'registered.csv',
          sizeBytes: 40,
          packageName: '등록 묶음',
        },
      ],
    }),
  );
  api.importSource.mockResolvedValue(
    ok([
      {
        id: 'imported',
        filename: 'registered.csv',
        size: 40,
        registered: true,
      },
    ]),
  );
  Object.defineProperty(window, 'qc', { value: api, configurable: true });
  // Execute the shipped plain renderer, not a duplicate state model.
  // Only this repository-owned script is evaluated in jsdom; no uploaded data or credentials.
  // oxlint-disable-next-line typescript/no-implied-eval
  new Function(script)();
});
describe('desktop renderer session and result boundaries', () => {
  it('shows account profile and one login control, then creates and selects a project', async () => {
    expect(el('refresh').hidden).toBe(true);
    await click('refresh');
    expect(el('profile').hidden).toBe(false);
    expect(el('memberEmail').textContent).toBe('member@test.invalid');
    expect(el('memberRole').textContent).toBe('일반 회원');
    expect(el('login').textContent).toBe('로그인됨');
    await click('newProject');
    (el('projectName') as HTMLInputElement).value = '새 현장';
    await click('projectSave');
    expect(api.createProject).toHaveBeenCalledWith({
      name: '새 현장',
      clientName: '',
    });
    expect((el('projects') as unknown as HTMLSelectElement).value).toBe('p2');
    expect((el('choose') as HTMLButtonElement).disabled).toBe(false);
    await click('logout');
    expect(el('profile').hidden).toBe(true);
    expect(el('memberEmail').textContent).toBe('');
  });
  it('keeps project input and does not retry an uncertain save', async () => {
    await click('refresh');
    await click('newProject');
    (el('projectName') as HTMLInputElement).value = '미확인 현장';
    api.createProject.mockResolvedValue({ error: '서버 응답 중단' });
    await click('projectSave');
    expect(api.createProject).toHaveBeenCalledOnce();
    expect((el('projectName') as HTMLInputElement).value).toBe('미확인 현장');
    expect(el('projectStatus').textContent).toContain('목록');
    expect(el('refresh').hidden).toBe(false);
  });
  it('does not revive login recovery after a late login error', async () => {
    const pending = deferred();
    api.login.mockReturnValue(pending.promise);
    const logging = click('login');
    await api.onAuthenticated.mock.calls[0][0]();
    pending.resolve({ error: 'late failure' });
    await logging;
    expect(el('refresh').hidden).toBe(true);
    expect(el('status').textContent).not.toContain('late failure');
  });
  const inspection = () => ({
    files: [
      {
        filename: 'test.csv',
        sha256: 'a'.repeat(64),
        sheets: [
          {
            name: 'Sheet1',
            mapping: {
              sourceVersionId: 'f7dba51d-c1a0-4d31-81cd-c0ab7f6a1120',
              sheet: 'Sheet1',
              headerRow: 1,
              kind: 'reference',
              columns: {
                item: 0,
                spec: null,
                unit: null,
                formula: 1,
                quantity: 2,
                trade: null,
                part: null,
                code: null,
                scope: null,
                dimension: null,
                cohort: null,
              },
              confirmed: false,
              arithmeticBasis: 'unknown',
              dimensionRole: 'unknown',
              dimensionUnit: '',
              cohortConfirmed: false,
            },
            preview: [
              {
                row: 7,
                cells: ['<script>not executable</script>', '2*3', '6'],
              },
            ],
          },
        ],
      },
    ],
    limitations: ['한계 안내'],
  });
  async function mappingReady() {
    await prepared();
    api.review.mockResolvedValueOnce(ok(inspection()));
    await click('inspectMapping');
  }
  async function cloudReady() {
    await click('cloudChoose');
    (el('cloudFile') as unknown as HTMLSelectElement).value = '1';
    el('cloudFile').dispatchEvent(new Event('change'));
  }
  it('requires project membership and preserves empty cloud states', async () => {
    expect((el('cloudChoose') as HTMLButtonElement).disabled).toBe(true);
    await click('cloudChoose');
    expect(api.cloudSources).not.toHaveBeenCalled();
    await prepared();
    api.cloudSources.mockResolvedValue(
      ok({ cases: [], caseId: null, files: [] }),
    );
    await click('cloudChoose');
    expect(el('cloudStatus').textContent).toContain('자료 기록이 없습니다');
    expect((el('cloudImport') as HTMLButtonElement).disabled).toBe(true);
  });
  it('replaces selected files and clears old mappings only after successful import', async () => {
    await mappingReady();
    await click('mappingConfirm');
    await cloudReady();
    await click('cloudImport');
    expect(api.importSource).toHaveBeenCalledWith({
      projectId: 'p1',
      caseId: 'c1',
      packageId: 'pkg1',
      sourceVersionId: 's1',
    });
    expect(window.confirm).toHaveBeenCalled();
    expect(el('rows').textContent).toContain('registered.csv');
    expect(el('rows').textContent).not.toContain('test.csv');
    expect(el('mappingPanel').textContent).toBe('');
    expect(el('status').textContent).toContain('서버 승인 미완료');
    api.review.mockResolvedValue(ok(result()));
    await click('run');
    expect(api.review).toHaveBeenLastCalledWith({
      projectId: 'p1',
      ids: ['imported'],
      overrides: [],
    });
  });
  it('preserves prior selection and mapping after failed or declined import', async () => {
    await mappingReady();
    await click('mappingConfirm');
    const mapping = el('mappingPanel').textContent;
    await cloudReady();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await click('cloudImport');
    expect(api.importSource).not.toHaveBeenCalled();
    api.importSource.mockResolvedValue({ error: '원본 다운로드 실패' });
    await click('cloudImport');
    expect(el('rows').textContent).toContain('test.csv');
    expect(el('mappingPanel').textContent).toBe(mapping);
    expect(el('cloudStatus').textContent).toContain('기존 선택과 매핑은 유지');
  });
  it('invalidates cloud listings and main requests on project change even when idle', async () => {
    await prepared();
    api.cancel.mockClear();
    const pending = deferred();
    api.cloudSources.mockReturnValue(pending.promise);
    const loading = click('cloudChoose');
    el('projects').dispatchEvent(new Event('change'));
    pending.resolve(
      ok({
        cases: [{ id: 'old', name: '이전 프로젝트' }],
        caseId: 'old',
        files: [],
      }),
    );
    await loading;
    expect(api.cancel).toHaveBeenCalledTimes(1);
    expect((el('cloudPanel') as HTMLElement).hidden).toBe(true);
    expect(el('cloudCase').textContent).not.toContain('이전 프로젝트');
    el('projects').dispatchEvent(new Event('change'));
    expect(api.cancel).toHaveBeenCalledTimes(2);
  });
  it.each(['logout', 'cancel'])(
    'does not restore a late import after %s',
    async (action) => {
      await prepared();
      await cloudReady();
      const pending = deferred();
      api.importSource.mockReturnValue(pending.promise);
      const importing = click('cloudImport');
      await click(action);
      pending.resolve(
        ok([{ id: 'late', filename: 'late.csv', size: 2, registered: true }]),
      );
      await importing;
      expect(el('rows').textContent).not.toContain('late.csv');
      expect((el('cloudPanel') as HTMLElement).hidden).toBe(true);
    },
  );
  it('shows original numbered preview as text and submits explicitly confirmed mapping', async () => {
    await mappingReady();
    expect(el('mappingPanel').textContent).toContain('7');
    expect(el('mappingPanel').querySelector('script')).toBeNull();
    const kind = el('mappingKind') as unknown as HTMLSelectElement;
    kind.value = 'detail';
    kind.dispatchEvent(new Event('change'));
    expect((el('run') as HTMLButtonElement).disabled).toBe(true);
    await click('run');
    expect(api.review).toHaveBeenCalledTimes(1);
    await click('mappingConfirm');
    expect((el('run') as HTMLButtonElement).disabled).toBe(false);
    await click('run');
    expect(api.review.mock.calls[1][0].overrides[0]).toMatchObject({
      filename: 'test.csv',
      sha256: 'a'.repeat(64),
      mapping: { kind: 'detail', confirmed: true },
    });
  });
  it('blocks duplicate columns and permits explicit cancellation of edits', async () => {
    await mappingReady();
    const qty = el('mapping-quantity') as unknown as HTMLSelectElement;
    qty.value = '0';
    qty.dispatchEvent(new Event('change'));
    await click('mappingConfirm');
    expect(el('status').textContent).toContain('같은 열');
    expect((el('run') as HTMLButtonElement).disabled).toBe(true);
    await click('mappingReset');
    expect((el('run') as HTMLButtonElement).disabled).toBe(false);
  });
  it.each(['detail', 'building-summary'])(
    'requires essential columns before confirming %s mapping',
    async (kind) => {
      await mappingReady();
      const change = (id: string, value: string) => {
        (el(id) as unknown as HTMLSelectElement).value = value;
        el(id).dispatchEvent(new Event('change'));
      };
      change('mappingKind', kind);
      if (kind === 'detail') change('mapping-formula', '');
      await click('mappingConfirm');
      expect(el('status').textContent).toContain('품명·산출식');
      expect(el('mappingState').textContent).toContain('변경됨');
      expect((el('run') as HTMLButtonElement).disabled).toBe(true);
    },
  );
  it('rejects a mapping outside a visible complete header width', async () => {
    await mappingReady();
    (el('mappingHeader') as HTMLInputElement).value = '7';
    el('mappingHeader').dispatchEvent(new Event('change'));
    (el('mapping-quantity') as unknown as HTMLSelectElement).value = '3';
    el('mapping-quantity').dispatchEvent(new Event('change'));
    await click('mappingConfirm');
    expect(el('status').textContent).toContain('열 범위');
    expect((el('run') as HTMLButtonElement).disabled).toBe(true);
  });
  it('clears mappings on project changes and never restores cancelled inspection', async () => {
    await mappingReady();
    await click('mappingConfirm');
    el('projects').dispatchEvent(new Event('change'));
    expect(el('mappingPanel').textContent).toBe('');
    const pending = deferred();
    api.review.mockReturnValueOnce(pending.promise);
    const inspecting = click('inspectMapping');
    await click('cancel');
    pending.resolve(ok(inspection()));
    await inspecting;
    expect((el('mappingPanel') as HTMLElement).hidden).toBe(true);
    expect(el('mappingPanel').textContent).toBe('');
  });
  it('clears mapped source and preview on logout', async () => {
    await mappingReady();
    await click('mappingConfirm');
    await click('logout');
    expect(el('mappingPanel').textContent).toBe('');
    expect((el('inspectMapping') as HTMLButtonElement).disabled).toBe(true);
  });
  it('clears project names and files when session validation fails', async () => {
    await prepared();
    api.session.mockResolvedValue({ error: '세션이 만료되었습니다.' });
    await click('refresh');
    expect(el('projects').textContent).not.toContain('시험 프로젝트');
    expect(el('rows').textContent).not.toContain('test.csv');
    expect(el('member').textContent).toBe('로그인 필요');
  });
  it('discards a file chooser response from the previous project', async () => {
    await prepared();
    const pending = deferred();
    api.choose.mockReturnValue(pending.promise);
    const choosing = click('choose');
    el('projects').dispatchEvent(new Event('change'));
    pending.resolve(
      ok([{ id: 'late', filename: 'previous-project.csv', size: 20 }]),
    );
    await choosing;
    expect(el('rows').textContent).not.toContain('previous-project.csv');
  });
  it('clears selected evidence immediately on logout, before the server response', async () => {
    await prepared();
    await click('run');
    el('rows').querySelector('button')!.click();
    expect(el('detail').textContent).toContain('비교 근거');
    const pending = deferred();
    api.logout.mockReturnValue(pending.promise);
    const logout = click('logout');
    expect(el('detail').textContent).not.toContain('비교 근거');
    expect(el('limitations').textContent).not.toContain('이전 실행 제한');
    expect(el('footer').textContent).not.toContain('private-run');
    pending.resolve(ok({}));
    await logout;
  });
  it('does not restore an in-flight review after logout', async () => {
    await prepared();
    const pending = deferred();
    api.review.mockReturnValue(pending.promise);
    const run = click('run');
    await click('logout');
    pending.resolve(ok(result()));
    await run;
    expect(el('rows').textContent).not.toContain('검토 후보');
    expect((el('exportTop') as HTMLButtonElement).disabled).toBe(true);
  });
  it('discards login confirmation arriving after logout', async () => {
    await prepared();
    const pending = deferred();
    api.session.mockReturnValue(pending.promise);
    const refresh = click('refresh');
    await click('logout');
    pending.resolve(
      ok({ email: 'member@test.invalid', displayName: '이전 회원' }),
    );
    await refresh;
    expect(el('member').textContent).toBe('로그인 필요');
  });
  it('clears results and file selections when the account changes', async () => {
    await prepared();
    await click('run');
    api.session.mockResolvedValue(
      ok({ email: 'other@test.invalid', displayName: '다른 회원' }),
    );
    await click('refresh');
    await click('projectTab');
    expect(el('member').textContent).toBe('다른 회원');
    expect(el('rows').textContent).not.toContain('test.csv');
    expect(el('footer').textContent).not.toContain('private-run');
  });
  it('clears previous detail at rerun start and keeps it cleared on failure', async () => {
    await prepared();
    await click('run');
    el('rows').querySelector('button')!.click();
    api.review.mockResolvedValue({ error: '검수 실패: 다시 시도하세요.' });
    await click('run');
    expect(el('detail').textContent).not.toContain('비교 근거');
    expect(el('status').textContent).toContain('검수 실패');
    expect((el('exportTop') as HTMLButtonElement).disabled).toBe(true);
  });
  it('ignores a late result after cancellation', async () => {
    await prepared();
    const pending = deferred();
    api.review.mockReturnValue(pending.promise);
    const run = click('run');
    await click('cancel');
    pending.resolve(ok(result()));
    await run;
    expect(el('rows').textContent).not.toContain('검토 후보');
    expect(el('status').textContent).toContain('중단했습니다');
  });
  it('renders actual evidence and labels missing source location', async () => {
    await prepared();
    await click('run');
    el('rows').querySelector('button')!.click();
    expect(el('rows').textContent).toContain('비교 근거 2 × 3');
    expect(el('detail').textContent).toContain(
      '원본 위치를 확정할 수 없습니다',
    );
  });
  it('shows source location when supplied without inventing missing coverage', async () => {
    await prepared();
    api.review.mockResolvedValue(
      ok({
        ...result(),
        sourceRefs: {
          r1: { filename: 'test.csv', sheet: '표1', row: 3, cell: 'C3' },
        },
      }),
    );
    await click('run');
    el('rows').querySelector('button')!.click();
    expect(el('detail').textContent).toContain('test.csv · 표1 · 3행 · C3');
  });
  it('distinguishes no evaluated rows from a zero-candidate result', async () => {
    await prepared();
    api.review.mockResolvedValue(
      ok({
        ...result(),
        findings: [],
        findingCount: 0,
        coverage: [{ evaluated: 0, unevaluated: 4 }],
      }),
    );
    await click('run');
    expect(el('empty').textContent).toContain('평가된 항목이 없습니다');
    expect(el('empty').textContent).toContain('적합 판정이 아닙니다');
  });
  it('does not call an unknown coverage or failed file set compliant', async () => {
    await prepared();
    api.review.mockResolvedValue(
      ok({ ...result(), findings: [], findingCount: 0 }),
    );
    await click('run');
    expect(el('empty').textContent).toContain('전체 적합 판정이 아닙니다');
    api.review.mockResolvedValue(
      ok({ ...result(), files: [], findings: [], findingCount: 0 }),
    );
    await click('run');
    expect(el('empty').textContent).toContain('미완료');
  });
});
