// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { defaultProfile, fields } from '../lib/review/contracts';
import { instructionAction } from './instructions.mjs';
const p = '10000000-0000-4000-8000-000000000001';
const c = '10000000-0000-4000-8000-000000000002';
const v = '10000000-0000-4000-8000-000000000003';
function fixture(admin = true, role = 'project_owner') {
  const state = {
    canManageGuidelines: admin,
    profiles: [
      {
        id: v,
        version: 1,
        status: 'draft',
        createdAt: 'now',
        trialRunId: null,
        profile: {
          ...defaultProfile,
          tolerance: 0.123,
          conditions: [{ field: 'item', operator: 'contains', value: '벽' }],
        },
      },
    ],
  };
  const api = vi.fn(async (path: string, method?: string) => {
    if (method === 'POST') return { id: v };
    if (path === '/api/projects') return [{ id: p, status: 'active', role }];
    if (path.endsWith('/cases'))
      return [{ id: c, name: '마감', discipline: 'FIN', status: 'draft' }];
    return state;
  });
  return { api, state };
}
async function saveInput(api: ReturnType<typeof fixture>['api']) {
  const listing = await instructionAction(api, {
    action: 'list',
    projectId: p,
  });
  return {
    action: 'save',
    projectId: p,
    caseId: c,
    baseProfileId: v,
    expectedRevision: listing.expectedRevision,
    name: '새 초안',
    reason: '보완',
    instructions: [{ id: 'rule-1', text: '부위를 확인하세요.', enabled: true }],
  };
}
describe('desktop administrator instruction drafts', () => {
  it('lists FIN cases and appends a draft preserving untouched conditions and tolerances', async () => {
    const { api } = fixture();
    const input = await saveInput(api);
    await expect(instructionAction(api, input)).resolves.toEqual({ id: v });
    const post = api.mock.calls.find(
      (call) => call[1] === 'POST',
    ) as unknown as [
      string,
      string,
      { action: string; profile: typeof defaultProfile },
    ];
    expect(post[0]).toBe(`/api/projects/${p}/review`);
    expect(post[2].action).toBe('profile');
    expect(post[2].profile.tolerance).toBe(0.123);
    expect(post[2].profile.conditions[0]?.value).toBe('벽');
    expect(post[2].profile.instructions?.[0]?.text).toBe(
      input.instructions[0]?.text,
    );
  });
  it.each([
    [false, 'project_owner'],
    [true, 'viewer'],
    [true, 'approver'],
  ])(
    'rejects non-admin or insufficient project role %s %s',
    async (admin, role) => {
      const { api } = fixture(admin as boolean, role as string);
      const input = await saveInput(api);
      await expect(instructionAction(api, input)).rejects.toThrow('관리자');
      expect(api.mock.calls.some((call) => call[1] === 'POST')).toBe(false);
    },
  );
  it('rejects stale revisions without overwriting another draft', async () => {
    const { api, state } = fixture();
    const input = await saveInput(api);
    state.profiles[0]!.profile.reason = '다른 화면에서 변경';
    await expect(instructionAction(api, input)).rejects.toThrow('버전이 변경');
    expect(api.mock.calls.some((call) => call[1] === 'POST')).toBe(false);
  });
  it('rejects arbitrary routes, other cases and executable actions before writes', async () => {
    const { api } = fixture();
    await expect(
      instructionAction(api, { action: 'list', projectId: '../settings' }),
    ).rejects.toThrow();
    expect(api).not.toHaveBeenCalled();
    await expect(
      instructionAction(api, { action: 'approve', projectId: p }),
    ).rejects.toThrow();
    await expect(
      instructionAction(api, { action: 'list', projectId: p, caseId: v }),
    ).rejects.toThrow('케이스');
  });
  it('rejects duplicate instruction IDs and UTF8 oversized payloads', async () => {
    const { api } = fixture();
    const input = await saveInput(api);
    input.instructions.push({ ...input.instructions[0]! });
    await expect(instructionAction(api, input)).rejects.toThrow('중복');
    // Add UTF8-heavy valid condition data to cross the actual byte limit.
    input.name = '😀'.repeat(50);
    input.reason = '😀'.repeat(250);
    // 10*1000 Hangul chars maximizes byte count under the text length limit.
    input.instructions = Array.from({ length: 10 }, (_, i) => ({
      id: `rule-${i}`,
      text: '한'.repeat(1000),
      enabled: true,
    }));
    // Remaining server fields can also consume the boundary; use long existing conditions.
    const f = fixture();
    f.state.profiles[0]!.profile.conditions = Array.from({ length: 8 }, () => ({
      field: 'item',
      operator: 'contains',
      value: '한'.repeat(120),
    }));
    const large = {
      ...(await saveInput(f.api)),
      name: input.name,
      reason: input.reason,
      instructions: input.instructions,
    };
    await expect(instructionAction(f.api, large)).rejects.toThrow('32KB');
    expect(f.api.mock.calls.some((call) => call[1] === 'POST')).toBe(false);
  });
});

describe('desktop instruction trial and activation', () => {
  const runId = '10000000-0000-4000-8000-000000000004';
  function trialFixture(admin = true) {
    const original = fixture(admin);
    const state = {
      ...original.state,
      sources: [{ sourceVersionId: v }],
      mappings: [
        {
          sourceVersionId: v,
          sheet: 'Sheet1',
          headerRow: 1,
          kind: 'detail',
          columns: Object.fromEntries(
            fields.map((field) => [
              field,
              field === 'item' ? 0 : field === 'formula' ? 1 : null,
            ]),
          ),
          confirmed: true,
          arithmeticBasis: 'formula-result',
          dimensionRole: 'unknown',
          dimensionUnit: '',
          cohortConfirmed: false,
        },
      ],
    };
    const run = {
      id: runId,
      projectId: p,
      caseId: c,
      profileId: v,
      profileVersion: 1,
      trial: true,
      createdAt: 'now',
      profile: state.profiles[0]!.profile,
      rows: [{ secret: 'not returned' }],
      findings: [],
      coverage: [
        {
          ruleId: 'ARITHMETIC',
          label: '산식',
          evaluated: 1,
          unevaluated: 0,
          reasons: [],
        },
      ],
      limitations: [],
    };
    const api = vi.fn(
      async (path: string, method?: string, data?: { action: string }) => {
        if (method === 'POST')
          return data?.action === 'run' ? { run, decisions: [] } : { id: v };
        if (path.includes('&runId=')) return { run, decisions: [] };
        if (path.includes('/review?')) return state;
        return original.api(path, method);
      },
    );
    return { api, state, run };
  }
  async function inputFor(
    api: ReturnType<typeof trialFixture>['api'],
    action = 'trial',
  ) {
    const listing = await instructionAction(api, {
      action: 'list',
      projectId: p,
      caseId: c,
    });
    return {
      action,
      projectId: p,
      caseId: c,
      profileId: v,
      ...(action !== 'trial-detail'
        ? { expectedRevision: listing.expectedRevision }
        : {}),
      ...(action !== 'trial' ? { trialRunId: runId } : {}),
    };
  }
  it('posts a no-AI trial and only returns bounded summaries', async () => {
    const { api } = trialFixture();
    const result = await instructionAction(api, await inputFor(api));
    expect(result).toMatchObject({ id: runId, rowCount: 1, canApprove: true });
    expect(result).not.toHaveProperty('rows');
    expect(api).toHaveBeenCalledWith(`/api/projects/${p}/review`, 'POST', {
      action: 'run',
      caseId: c,
      profileId: v,
      trial: true,
      includeAi: false,
    });
  });
  it('does not count mappings of removed sources as ready for a server trial', async () => {
    const { api, state } = trialFixture();
    state.mappings[0]!.sourceVersionId = p;
    const listing = await instructionAction(api, {
      action: 'list',
      projectId: p,
      caseId: c,
    });
    expect(listing.sourcesCount).toBe(1);
    expect(listing.confirmedMappingCount).toBe(0);
    await expect(instructionAction(api, await inputFor(api))).rejects.toThrow(
      '매핑',
    );
    expect(api.mock.calls.some((call) => call[1] === 'POST')).toBe(false);
  });
  it('reads exact trial detail and activates the selected version', async () => {
    const { api } = trialFixture();
    await expect(
      instructionAction(api, await inputFor(api, 'trial-detail')),
    ).resolves.toMatchObject({ id: runId });
    expect(api.mock.calls.some((call) => call[1] === 'POST')).toBe(false);
    await expect(
      instructionAction(api, await inputFor(api, 'approve')),
    ).resolves.toEqual({ id: v });
  });
  it.each(['profile', 'case', 'id', 'nontrial', 'empty', 'ai'])(
    'rejects mismatched or ineligible trial %s',
    async (kind) => {
      const { api, run } = trialFixture();
      if (kind === 'profile') run.profileId = c;
      if (kind === 'case') run.caseId = v;
      if (kind === 'id') run.id = v;
      if (kind === 'nontrial') run.trial = false;
      if (kind === 'empty') run.coverage[0]!.evaluated = 0;
      if (kind === 'ai')
        run.profile.instructions = [
          { id: 'custom', text: '검토', enabled: true },
        ];
      await expect(
        instructionAction(api, await inputFor(api, 'approve')),
      ).rejects.toThrow();
      expect(api.mock.calls.some((call) => call[1] === 'POST')).toBe(false);
    },
  );
  it('rejects missing mapping, non-admin, stale revision and injected AI option', async () => {
    const f = trialFixture();
    const input = await inputFor(f.api);
    f.state.mappings = [];
    await expect(instructionAction(f.api, input)).rejects.toThrow('매핑');
    await expect(
      instructionAction(f.api, { ...input, includeAi: true }),
    ).rejects.toThrow();
    f.state.profiles[0]!.profile.reason = 'changed';
    await expect(instructionAction(f.api, input)).rejects.toThrow(
      '버전이 변경',
    );
    const denied = trialFixture(false);
    await expect(
      instructionAction(denied.api, await inputFor(denied.api, 'trial-detail')),
    ).rejects.toThrow('관리자');
    expect(f.api.mock.calls.some((call) => call[1] === 'POST')).toBe(false);
  });
  it('does not retry a lost trial response', async () => {
    const f = trialFixture();
    const input = await inputFor(f.api);
    const api = vi.fn(async (path: string, method?: string) => {
      if (method === 'POST') throw new Error('timeout');
      return f.api(path, method);
    });
    await expect(instructionAction(api, input)).rejects.toThrow('timeout');
    expect(api.mock.calls.filter((call) => call[1] === 'POST')).toHaveLength(1);
  });
});
