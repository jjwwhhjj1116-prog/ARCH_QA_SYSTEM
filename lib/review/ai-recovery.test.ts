// @vitest-environment node
vi.mock('@/lib/server/ai/regional-fetch', () => ({
  regionalGeminiFetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, init),
}));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiRecoveryStore, type RecoveryRecord } from './ai-recovery';
import { defaultProfile, fields, type Mapping, type Run } from './contracts';
import { sqliteD1 } from '../../tests/helpers/sqlite-d1';
const mock = vi.hoisted(() => ({
  db: null as D1Database | null,
  put: vi.fn(),
  ai: vi.fn(),
}));
vi.mock('@/db', () => ({ getD1Binding: () => mock.db }));
vi.mock('@/lib/files/review-storage', () => ({
  reviewStorage: () => ({
    put: mock.put,
    get: async (key: string) => {
      const call = mock.put.mock.calls.findLast((call) => call[0] === key);
      const bytes = call?.[1] as Uint8Array<ArrayBuffer> | undefined;
      return bytes
        ? { size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }
        : null;
    },
  }),
}));
vi.mock('@/lib/files/r2-factory', () => ({ getPrivateFileStorage: vi.fn() }));
vi.mock('@/lib/server/ai/company-settings', () => ({
  getCompanyGeminiConfig: async () => ({
    apiKey: 'synthetic',
    model: 'gemini-synthetic',
    version: 1,
  }),
}));
vi.mock('./gemini-review', () => ({ reviewWithGemini: mock.ai }));
import { ReviewService } from './server';
const p = '10000000-0000-4000-8000-000000000001',
  c = '10000000-0000-4000-8000-000000000002',
  r = '10000000-0000-4000-8000-000000000003',
  requestKey = '10000000-0000-4000-8000-000000000004';
const actor = {
  id: 'u',
  email: 'yjw@con-cost.com',
  displayName: 'Synthetic',
  source: 'workspace' as const,
};
const frozen: Run = {
  id: r,
  projectId: p,
  caseId: c,
  actorId: 'u',
  createdAt: '2026-09-11T00:00:00Z',
  profileId: r,
  profileVersion: 1,
  profile: defaultProfile,
  trial: false,
  engineVersion: 'synthetic',
  rows: [],
  sources: [],
  mappings: [],
  findings: [],
  coverage: [],
  limitations: [],
};
const record: RecoveryRecord = {
  actorId: 'u',
  projectId: p,
  caseId: c,
  requestKey,
  runId: r,
  fingerprint: 'synthetic',
  state: 'claimed',
};
function memoryStorage() {
  const data = new Map<string, unknown>();
  const adapter = {
    get: async <T>(key: string) =>
      structuredClone(data.get(key)) as T | undefined,
    put: async (key: string, value: unknown) => {
      data.set(key, structuredClone(value));
    },
    delete: async (key: string) => data.delete(key),
    list: async <T>(options: { prefix: string; limit: number }) =>
      new Map(
        [...data]
          .filter(([key]) => key.startsWith(options.prefix))
          .slice(0, options.limit),
      ) as Map<string, T>,
    transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      const before = structuredClone(data);
      try {
        return await callback(adapter);
      } catch (error) {
        data.clear();
        for (const [key, value] of before) data.set(key, value);
        throw error;
      }
    },
  };
  return { data, storage: adapter as unknown as DurableObjectStorage };
}
describe('bounded AI result recovery journal', () => {
  it('survives store recreation, verifies chunks and removes only bodies on completion', async () => {
    const { storage, data } = memoryStorage();
    const first = new AiRecoveryStore(storage);
    await first.claim(record);
    const run = { ...frozen, limitations: ['x'.repeat(300000)] };
    await first.checkpoint(record, run);
    expect(
      [...data].filter(([k]) => k.startsWith('ai-body/')).length,
    ).toBeGreaterThan(1);
    const second = new AiRecoveryStore(storage);
    const ready = (await second.get('u', c, requestKey))!;
    expect(await second.read(ready)).toEqual(run);
    expect(await second.pending('other', c)).toEqual([]);
    await second.complete(ready);
    expect([...data.keys()].some((k) => k.startsWith('ai-body/'))).toBe(false);
    expect((await first.get('u', c, requestKey))?.state).toBe('completed');
    await expect(first.claim(record)).rejects.toMatchObject({
      code: 'AI_REQUEST_ALREADY_STARTED',
    });
  });
  it('blocks uncertain and corrupted records without inventing a result', async () => {
    const { storage, data } = memoryStorage();
    const journal = new AiRecoveryStore(storage);
    await journal.claim(record);
    await expect(journal.read(record)).rejects.toMatchObject({
      code: 'AI_RESULT_UNCERTAIN',
    });
    await journal.checkpoint(record, frozen);
    data.set(`ai-body/${r}/0`, new Uint8Array([1, 2]));
    await expect(
      journal.read((await journal.get('u', c, requestKey))!),
    ).rejects.toMatchObject({ code: 'AI_RECOVERY_INTEGRITY' });
  });
  it('blocks new paid work when four pending slots are occupied', async () => {
    const journal = new AiRecoveryStore(memoryStorage().storage);
    for (let i = 0; i < 4; i++)
      await journal.claim({ ...record, requestKey: `request-${i}` });
    await expect(journal.claim(record)).rejects.toMatchObject({
      code: 'AI_RECOVERY_CAPACITY',
    });
  });
  it('limits completed tombstones rather than silently expiring idempotency records', async () => {
    const { storage, data } = memoryStorage();
    for (let i = 0; i < 1000; i++)
      data.set(`ai-meta/u/${c}/old-${i}`, { ...record, state: 'completed' });
    await expect(
      new AiRecoveryStore(storage).claim(record),
    ).rejects.toMatchObject({ code: 'AI_RECOVERY_CAPACITY' });
  });
});
describe('AI success then Drive persistence failure', () => {
  let fixture: ReturnType<typeof sqliteD1>,
    service: ReviewService,
    journal: AiRecoveryStore;
  beforeEach(() => {
    fixture = sqliteD1();
    mock.db = fixture.db;
    vi.clearAllMocks();
    journal = new AiRecoveryStore(memoryStorage().storage);
    fixture.sqlite
      .prepare('INSERT INTO user_profile VALUES (?,?,?,0)')
      .run('u', actor.email, actor.displayName);
    fixture.sqlite
      .prepare("INSERT INTO project VALUES (?,?,?,NULL,'active','u',0)")
      .run(p, 'P', 'Synthetic');
    fixture.sqlite
      .prepare(
        "INSERT INTO project_member VALUES ('m',?,'u','project_owner',0)",
      )
      .run(p);
    fixture.sqlite
      .prepare(
        "INSERT INTO review_case VALUES (?,?,'Synthetic','FIN','draft','u',NULL,NULL,0)",
      )
      .run(c, p);
    const profile = {
      ...defaultProfile,
      instructions: [{ id: 'one', text: '합성 검수', enabled: true }],
    };
    fixture.sqlite
      .prepare("INSERT INTO qc_profile_version VALUES (?,?,1,?,'u','now')")
      .run(r, p, JSON.stringify(profile));
    const mapping: Mapping = {
      sourceVersionId: r,
      sheet: 'Sheet1',
      headerRow: 1,
      kind: 'detail',
      columns: {
        ...Object.fromEntries(fields.map((f) => [f, null])),
        item: 0,
        formula: 1,
        quantity: 2,
        unit: 3,
      } as Mapping['columns'],
      confirmed: true,
      arithmeticBasis: 'formula-result',
      dimensionRole: 'unknown',
      dimensionUnit: '',
      cohortConfirmed: false,
    };
    service = new ReviewService(journal);
    vi.spyOn(service, 'state').mockResolvedValue({
      sources: [
        {
          sourceVersionId: r,
          sourceFileId: r,
          filename: 'synthetic.csv',
          format: 'csv',
          packageId: r,
        },
      ],
      profiles: [
        {
          id: r,
          version: 1,
          status: 'draft',
          profile,
          createdAt: 'now',
          trialRunId: null,
        },
      ],
      runs: [],
      mappingVersionId: null,
      mappings: [mapping],
    });
    vi.spyOn(service, 'readSource').mockResolvedValue({
      sha256: 'synthetic',
      sheets: [
        {
          name: 'Sheet1',
          rows: [
            {
              number: 1,
              cells: ['품명', '산식', '물량', '단위'],
              hidden: false,
            },
            { number: 2, cells: ['합성', '2*3', '9', 'm2'], hidden: false },
          ],
        },
      ],
    });
    mock.ai.mockResolvedValue({
      ai: {
        provider: 'google-gemini',
        model: 'gemini-synthetic',
        promptVersion: 'synthetic',
        inputHash: 'synthetic',
        inputTokens: 1,
        outputTokens: 1,
        costUsd: null,
        state: 'completed',
        evaluatedRows: 1,
        totalRows: 1,
      },
      findings: [],
      coverage: [],
      limitations: [],
    });
    mock.put.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fixture.close();
  });
  const execute = () =>
    service.mutate(
      actor,
      p,
      {
        action: 'run',
        caseId: c,
        profileId: r,
        trial: true,
        includeAi: true,
        requestKey,
      },
      'first',
    );
  const resume = () =>
    service.mutate(
      actor,
      p,
      { action: 'resume-ai-save', caseId: c, requestKey },
      crypto.randomUUID(),
    );
  it('retries exact frozen results without reparsing, reloading guidelines or charging again', async () => {
    mock.put.mockRejectedValueOnce(new Error('synthetic outage'));
    await expect(execute()).rejects.toMatchObject({
      code: 'AI_RESULT_SAVE_PENDING',
    });
    expect(mock.ai).toHaveBeenCalledTimes(1);
    const pending = (await journal.get('u', c, requestKey))!;
    expect(pending.state).toBe('ready');
    const saved = (await resume()) as { run: Run };
    expect(saved.run.id).toBe(pending.runId);
    expect(mock.put.mock.calls[1][1]).toEqual(mock.put.mock.calls[0][1]);
    expect(mock.ai).toHaveBeenCalledTimes(1);
    expect(
      fixture.sqlite.prepare('SELECT COUNT(*) n FROM qc_review_run').get(),
    ).toEqual({ n: 1 });
    expect((await journal.get('u', c, requestKey))?.state).toBe('completed');
    await execute();
    expect(mock.ai).toHaveBeenCalledTimes(1);
    expect(mock.put).toHaveBeenCalledTimes(2);
  });
  it('recovers database failure after Drive success using the same run ID', async () => {
    fixture.sqlite.exec(
      "CREATE TRIGGER synthetic_failure BEFORE INSERT ON qc_review_run BEGIN SELECT RAISE(ABORT,'synthetic'); END",
    );
    await expect(execute()).rejects.toMatchObject({
      code: 'AI_RESULT_SAVE_PENDING',
    });
    fixture.sqlite.exec('DROP TRIGGER synthetic_failure');
    await resume();
    expect(mock.put.mock.calls[1][0]).toEqual(mock.put.mock.calls[0][0]);
    expect(mock.ai).toHaveBeenCalledTimes(1);
  });
  it('denies recovery to another actor and after membership revocation', async () => {
    mock.put.mockRejectedValueOnce(new Error('outage'));
    await expect(execute()).rejects.toMatchObject({
      code: 'AI_RESULT_SAVE_PENDING',
    });
    await expect(
      service.mutate(
        { ...actor, id: 'other' },
        p,
        { action: 'resume-ai-save', caseId: c, requestKey },
        'other',
      ),
    ).rejects.toMatchObject({ status: 403 });
    fixture.sqlite.prepare('DELETE FROM project_member').run();
    await expect(resume()).rejects.toMatchObject({ status: 403 });
    expect(mock.ai).toHaveBeenCalledTimes(1);
  });
  it('fails closed before company API calls if production Drive has no journal', async () => {
    vi.stubEnv('FILE_STORAGE_PROVIDER', 'google-drive');
    await expect(
      new ReviewService().mutate(
        actor,
        p,
        {
          action: 'run',
          caseId: c,
          profileId: r,
          trial: true,
          includeAi: true,
          requestKey,
        },
        'no-journal',
      ),
    ).rejects.toMatchObject({ code: 'AI_RECOVERY_UNAVAILABLE' });
    expect(mock.ai).not.toHaveBeenCalled();
  });
  it('rechecks membership atomically inside final D1 commit', async () => {
    const batch = fixture.db.batch.bind(fixture.db);
    vi.spyOn(fixture.db, 'batch').mockImplementation(async (statements) => {
      // Source census also uses a read batch. Revoke at persistence, after AI.
      if (mock.ai.mock.calls.length)
        fixture.sqlite.prepare('DELETE FROM project_member').run();
      return batch(statements);
    });
    await expect(execute()).rejects.toMatchObject({ status: 403 });
    expect(
      fixture.sqlite.prepare('SELECT COUNT(*) n FROM qc_review_run').get(),
    ).toEqual({ n: 0 });
    expect(
      fixture.sqlite.prepare('SELECT COUNT(*) n FROM audit_event').get(),
    ).toEqual({ n: 0 });
    expect((await journal.get('u', c, requestKey))?.state).toBe('ready');
  });
});
