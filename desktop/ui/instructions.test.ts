import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile } from '../../lib/review/contracts';

const script = readFileSync('desktop/ui/instructions.js', 'utf8');
let api: ReturnType<typeof vi.fn>;
let contextListener: EventListener;
const el = <T = HTMLElement>(id: string) =>
  document.getElementById(id)! as unknown as T;
const listing = () => ({
  cases: [{ id: 'case1', name: '마감 자료' }],
  caseId: 'case1',
  canManageGuidelines: true,
  expectedRevision: 'digest',
  sourcesCount: 1,
  confirmedMappingCount: 1,
  runs: [],
  defaultProfile,
  profiles: [
    {
      id: 'profile1',
      version: 3,
      status: 'draft',
      profile: {
        ...defaultProfile,
        name: '기존 지침',
        reason: '기존 사유',
        tolerance: 0.3,
        instructions: [
          { id: 'existing', text: '기존 확인 항목', enabled: false },
        ],
      },
    },
  ],
});
const context = (signed = true, projectId = 'p1', busy = false) =>
  window.dispatchEvent(
    new CustomEvent('qc:context', {
      detail: { signed, projectId, busy, isAdmin: true },
    }),
  );
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
const trialSummary = (canApprove = true) => ({
  id: 'run1',
  profileId: 'profile1',
  profileVersion: 3,
  rowCount: 2,
  findingCount: 1,
  coverage: [
    {
      ruleId: 'ARITH',
      label: '산식',
      evaluated: 1,
      unevaluated: 1,
      reasons: ['단위 확인 필요'],
    },
  ],
  limitations: ['도면은 검사하지 않았습니다.'],
  canApprove,
  approvalBlockers: canApprove
    ? []
    : ['활성 AI 지침마다 AI 시험 평가가 필요합니다.'],
});
async function open() {
  context();
  el<HTMLButtonElement>('instructionsToggle').click();
  await flush();
}
function selectProfile() {
  el<HTMLSelectElement>('instructionProfile').value = 'profile1';
  el('instructionProfile').dispatchEvent(new Event('input', { bubbles: true }));
  el('instructionProfile').dispatchEvent(new Event('change'));
}
async function submit() {
  el('instructionsForm').dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  await flush();
}
beforeEach(() => {
  document.documentElement.innerHTML = readFileSync(
    'desktop/ui/index.html',
    'utf8',
  );
  api = vi.fn().mockResolvedValue({ data: listing() });
  Object.defineProperty(window, 'qc', {
    value: { instructions: api },
    configurable: true,
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation(
    (type, listener, options) => {
      if (String(type) === 'qc:context')
        contextListener = listener as EventListener;
      add(type, listener, options);
    },
  );
  // Execute repository-owned renderer, never user-provided code.
  // oxlint-disable-next-line typescript/no-implied-eval
  new Function(script)();
});
afterEach(() => {
  window.removeEventListener('qc:context', contextListener);
  vi.restoreAllMocks();
});

describe('desktop instruction editor', () => {
  it('requires a saved version, server sources, confirmed mapping and no unsaved edits', async () => {
    const data = listing();
    data.sourcesCount = 0;
    data.confirmedMappingCount = 0;
    api.mockResolvedValueOnce({ data });
    await open();
    expect(el<HTMLButtonElement>('instructionTrial').disabled).toBe(true);
    selectProfile();
    expect(el('instructionReadiness').textContent).toContain(
      '서버 자료 등록과 매핑 확인',
    );
    expect(el<HTMLButtonElement>('instructionTrial').disabled).toBe(true);
    el<HTMLButtonElement>('instructionReload').click();
    await flush();
    selectProfile();
    expect(el<HTMLButtonElement>('instructionTrial').disabled).toBe(false);
    el<HTMLInputElement>('instructionName').value = '미저장';
    el('instructionName').dispatchEvent(new Event('input', { bubbles: true }));
    expect(el<HTMLButtonElement>('instructionTrial').disabled).toBe(true);
    expect(el('instructionReadiness').textContent).toContain('미저장 편집');
  });
  it('refreshes revision after trial, shows coverage and confirms activation of exact run', async () => {
    await open();
    selectProfile();
    const refreshed = { ...listing(), expectedRevision: 'after-trial' };
    api
      .mockResolvedValueOnce({ data: trialSummary() })
      .mockResolvedValueOnce({ data: refreshed });
    el<HTMLButtonElement>('instructionTrial').click();
    await flush();
    expect(api.mock.calls[1]?.[0]).toEqual({
      action: 'trial',
      projectId: 'p1',
      caseId: 'case1',
      profileId: 'profile1',
      expectedRevision: 'digest',
    });
    expect(el('instructionTrialResult').textContent).toContain('미평가');
    expect(el('instructionTrialResult').textContent).toContain(
      '단위 확인 필요',
    );
    expect(el('instructionTrialResult').textContent).toContain(
      '도면은 검사하지 않았습니다',
    );
    expect(el<HTMLButtonElement>('instructionApprove').disabled).toBe(false);
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    el<HTMLButtonElement>('instructionApprove').click();
    expect(
      api.mock.calls.filter(([input]) => input.action === 'approve'),
    ).toHaveLength(0);
    const active = listing();
    active.profiles[0]!.status = 'active';
    api
      .mockResolvedValueOnce({ data: { id: 'profile1' } })
      .mockResolvedValueOnce({ data: active });
    el<HTMLButtonElement>('instructionApprove').click();
    await flush();
    expect(
      api.mock.calls.find(([input]) => input.action === 'approve')?.[0],
    ).toEqual({
      action: 'approve',
      projectId: 'p1',
      caseId: 'case1',
      profileId: 'profile1',
      expectedRevision: 'after-trial',
      trialRunId: 'run1',
    });
    expect(el<HTMLButtonElement>('instructionApprove').disabled).toBe(true);
    expect(
      el<HTMLSelectElement>('instructionProfile').selectedOptions[0]
        ?.textContent,
    ).toContain('active');
  });
  it('loads a server trial history and keeps unevaluated AI instructions blocked', async () => {
    const data = {
      ...listing(),
      runs: [
        {
          id: 'old-run',
          trial: true,
          profileVersion: 3,
          createdAt: '2026-09-10',
        },
      ],
    };
    api.mockResolvedValueOnce({ data });
    await open();
    selectProfile();
    const history = el<HTMLSelectElement>('instructionTrialHistory');
    history.value = 'old-run';
    history.dispatchEvent(new Event('change'));
    api.mockResolvedValueOnce({
      data: { ...trialSummary(false), id: 'old-run' },
    });
    el<HTMLButtonElement>('instructionTrialDetail').click();
    await flush();
    expect(api.mock.lastCall?.[0]).toEqual({
      action: 'trial-detail',
      projectId: 'p1',
      caseId: 'case1',
      profileId: 'profile1',
      trialRunId: 'old-run',
    });
    expect(el<HTMLButtonElement>('instructionApprove').disabled).toBe(true);
    expect(el('instructionTrialResult').textContent).toContain(
      'AI 시험 평가가 필요',
    );
  });
  it('does not retry a lost trial response and blocks another trial until history refresh', async () => {
    await open();
    selectProfile();
    api.mockResolvedValueOnce({ error: '연결 끊김' });
    el<HTMLButtonElement>('instructionTrial').click();
    await flush();
    el<HTMLButtonElement>('instructionTrial').click();
    expect(
      api.mock.calls.filter(([input]) => input.action === 'trial'),
    ).toHaveLength(1);
    expect(el<HTMLButtonElement>('instructionTrial').disabled).toBe(true);
    expect(el('instructionsPanel').textContent).toContain('시험 이력을 확인');
    expect(el<HTMLInputElement>('instructionName').value).toBe('기존 지침');
  });
  it.each(['project', 'logout'])(
    'ignores a late trial response after %s and clears result',
    async (change) => {
      await open();
      selectProfile();
      let resolve!: (value: unknown) => void;
      api.mockReturnValueOnce(
        new Promise((r) => {
          resolve = r;
        }),
      );
      el<HTMLButtonElement>('instructionTrial').click();
      if (change === 'logout') context(false, '');
      else context(true, 'p2');
      resolve({ data: trialSummary() });
      await flush();
      expect(el('instructionTrialResult').textContent).toBe('');
      expect(
        api.mock.calls.filter(([input]) => input.action === 'list'),
      ).toHaveLength(1);
      expect(el<HTMLButtonElement>('instructionApprove').disabled).toBe(true);
    },
  );
  it('loads profiles, copies an existing version and sends only editable draft fields', async () => {
    await open();
    selectProfile();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(el<HTMLInputElement>('instructionName').value).toBe('기존 지침');
    expect(el('instructionRows').querySelector('input')!.checked).toBe(false);
    el<HTMLButtonElement>('instructionAdd').click();
    const texts = el('instructionRows').querySelectorAll('textarea');
    texts[1]!.value = '추가 조건';
    texts[1]!.dispatchEvent(new Event('input', { bubbles: true }));
    api.mockResolvedValueOnce({ data: { id: 'new' } });
    await submit();
    expect(api.mock.lastCall?.[0]).toEqual({
      action: 'save',
      projectId: 'p1',
      caseId: 'case1',
      baseProfileId: 'profile1',
      expectedRevision: 'digest',
      name: '기존 지침',
      reason: '기존 사유',
      instructions: [
        { id: 'existing', text: '기존 확인 항목', enabled: false },
        { id: expect.any(String), text: '추가 조건', enabled: true },
      ],
    });
    expect(el('instructionsPanel').textContent).toContain(
      '아직 시험·활성화되지 않았습니다',
    );
  });
  it('preserves unsaved fields and revision after save failure without retrying', async () => {
    await open();
    selectProfile();
    el<HTMLInputElement>('instructionName').value = '보존할 초안';
    api.mockResolvedValueOnce({ error: '서버 저장 실패' });
    await submit();
    expect(el<HTMLInputElement>('instructionName').value).toBe('보존할 초안');
    expect(el('instructionRows').querySelector('textarea')!.value).toBe(
      '기존 확인 항목',
    );
    expect(el('instructionsPanel').textContent).toContain(
      '자동 재시도하지 않습니다',
    );
    expect(
      api.mock.calls.filter(([input]) => input.action === 'save'),
    ).toHaveLength(1);
  });
  it.each(['project', 'logout'])(
    'discards a late list response after %s',
    async (change) => {
      let resolve!: (value: unknown) => void;
      api.mockReturnValueOnce(
        new Promise((r) => {
          resolve = r;
        }),
      );
      context();
      el<HTMLButtonElement>('instructionsToggle').click();
      if (change === 'logout') context(false, '');
      else context(true, 'p2');
      resolve({ data: listing() });
      await flush();
      expect(el('instructionsPanel').hidden).toBe(true);
      expect(el<HTMLSelectElement>('instructionProfile').options).toHaveLength(
        0,
      );
      expect(el<HTMLInputElement>('instructionName').value).toBe('');
    },
  );
  it('clears private drafts on logout and ignores late save confirmation', async () => {
    await open();
    selectProfile();
    let resolve!: (value: unknown) => void;
    api.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    await submit();
    context(false, '');
    resolve({ data: { id: 'new' } });
    await flush();
    expect(el('instructionsPanel').textContent).not.toContain(
      '새 초안 버전을 저장했습니다',
    );
    expect(el('instructionRows').children).toHaveLength(0);
    await open();
    expect(el<HTMLInputElement>('instructionName').value).toBe(
      defaultProfile.name,
    );
  });
  it('disables edits for non-admin capability and caps instruction count', async () => {
    const data = listing();
    data.canManageGuidelines = false;
    api.mockResolvedValueOnce({ data });
    await open();
    expect(el<HTMLButtonElement>('instructionSave').disabled).toBe(true);
    expect(el<HTMLInputElement>('instructionName').disabled).toBe(true);
    context(false, '');
    await open();
    for (let i = 0; i < 12; i++)
      el<HTMLButtonElement>('instructionAdd').click();
    expect(el('instructionRows').children).toHaveLength(10);
    expect(el<HTMLButtonElement>('instructionAdd').disabled).toBe(true);
  });
});
