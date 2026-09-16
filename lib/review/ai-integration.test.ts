// @vitest-environment node
vi.mock('@/lib/server/ai/regional-fetch', () => ({
  regionalGeminiFetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, init),
}));
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../../tests/helpers/sqlite-d1';
import { defaultProfile, fields, type Mapping, type Run } from './contracts';
const mock = vi.hoisted(() => ({
  db: null as D1Database | null,
  put: vi.fn(),
  get: vi.fn(),
  source: vi.fn(),
  ai: vi.fn(),
  config: vi.fn(),
}));
vi.mock('@/db', () => ({ getD1Binding: () => mock.db }));
vi.mock('@/lib/files/review-storage', () => ({
  reviewStorage: () => ({ put: mock.put, get: mock.get }),
}));
vi.mock('@/lib/files/r2-factory', () => ({
  getPrivateFileStorage: () => ({ getSourceFile: mock.source }),
}));
vi.mock('@/lib/server/ai/company-settings', () => ({
  getCompanyGeminiConfig: mock.config,
}));
vi.mock('./gemini-review', () => ({ reviewWithGemini: mock.ai }));
import { ReviewService, reviewRequestSchema } from './server';
import { SourcePackageService } from '../ingestion/service';
import { D1SourcePackageRepository } from '../ingestion/d1-repository';
import { exportReview } from './report';
import { readWorkbook } from './workbook';
const p = '10000000-0000-4000-8000-000000000001',
  c = '10000000-0000-4000-8000-000000000002',
  v = '10000000-0000-4000-8000-000000000003',
  sourceId = '10000000-0000-4000-8000-000000000004',
  requestKey = '10000000-0000-4000-8000-000000000005';
const actor = {
  id: 'u',
  email: 'yjw@con-cost.com',
  source: 'workspace' as const,
  displayName: 'Synthetic admin',
};
const profile = {
  ...defaultProfile,
  instructions: [{ id: 'rule-one', text: '합성 산식 확인', enabled: true }],
};
let fixture: ReturnType<typeof sqliteD1>, service: ReviewService;
const metadata = {
  provider: 'google-gemini',
  model: 'gemini-synthetic',
  promptVersion: 'synthetic-v1',
  inputHash: 'synthetic-hash',
  inputTokens: 10,
  outputTokens: 5,
  costUsd: null,
  state: 'completed',
  evaluatedRows: 1,
  totalRows: 1,
};
beforeEach(() => {
  fixture = sqliteD1();
  mock.db = fixture.db;
  vi.clearAllMocks();
  fixture.sqlite
    .prepare('INSERT INTO user_profile VALUES (?,?,?,0)')
    .run('u', actor.email, actor.displayName);
  fixture.sqlite
    .prepare("INSERT INTO project VALUES (?,?,?,NULL,'active','u',0)")
    .run(p, 'P', 'Synthetic');
  fixture.sqlite
    .prepare("INSERT INTO project_member VALUES ('m',?,'u','project_owner',0)")
    .run(p);
  fixture.sqlite
    .prepare(
      "INSERT INTO review_case VALUES (?,?,'Synthetic','FIN','draft','u',NULL,NULL,0)",
    )
    .run(c, p);
  fixture.sqlite
    .prepare("INSERT INTO qc_profile_version VALUES (?,?,1,?,'u','now')")
    .run(v, p, JSON.stringify(profile));
  fixture.sqlite
    .prepare(
      "INSERT INTO qc_review_run VALUES ('trial',?,?,?,1,1,'trial-key','hash',1,1,'u','now')",
    )
    .run(p, c, v);
  fixture.sqlite
    .prepare(
      "INSERT INTO qc_profile_approval VALUES ('approval',?,?,'trial','u','now')",
    )
    .run(p, v);
  const mapping: Mapping = {
    sourceVersionId: sourceId,
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
  service = new ReviewService();
  vi.spyOn(service, 'state').mockResolvedValue({
    mappingVersionId: null,
    sources: [
      {
        sourceVersionId: sourceId,
        sourceFileId: sourceId,
        filename: 'synthetic.csv',
        format: 'csv',
        packageId: sourceId,
      },
    ],
    profiles: [
      {
        id: v,
        version: 1,
        status: 'active',
        profile,
        createdAt: 'now',
        trialRunId: 'trial',
      },
    ],
    runs: [],
    mappings: [mapping],
  });
  vi.spyOn(service, 'readSource').mockResolvedValue({
    sha256: 'synthetic-sha',
    sheets: [
      {
        name: 'Sheet1',
        rows: [
          { number: 1, cells: ['품명', '산식', '물량'], hidden: false },
          { number: 2, cells: ['합성', '2*3', '9', 'm2'], hidden: false },
        ],
      },
    ],
  });
  mock.put.mockResolvedValue(undefined);
  mock.config.mockResolvedValue({
    apiKey: 'synthetic-key-never-real',
    model: 'gemini-synthetic',
    version: 7,
  });
  mock.ai.mockImplementation(async ({ rows }) => ({
    ai: metadata,
    findings: [
      {
        id: 'ai-finding',
        ruleId: 'AI-rule-one',
        level: 'C',
        severity: 'check',
        confidence: 'candidate',
        title: '합성 후보',
        rowId: rows[0].id,
        evidence: ['합성 근거'],
        peerIds: [],
        limitation: '사람 확인 필요',
      },
    ],
    coverage: [
      {
        ruleId: 'AI-rule-one',
        label: '합성 지침',
        evaluated: 1,
        unevaluated: 0,
        reasons: [],
      },
    ],
    limitations: ['AI 후보는 정상 확정 아님'],
  }));
});
afterEach(() => {
  fixture.close();
  vi.restoreAllMocks();
});
const execute = (includeAi: boolean) =>
  service.mutate(
    actor,
    p,
    reviewRequestSchema.parse({
      action: 'run',
      caseId: c,
      profileId: v,
      trial: false,
      includeAi,
      requestKey,
    }),
    'synthetic-request',
  );
const stored = (): Run =>
  JSON.parse(new TextDecoder().decode(mock.put.mock.calls.at(-1)![1]));
describe('AI review orchestration with SQLite and synthetic source', () => {
  it('continues only unsent rows and rejects a duplicate continuation', async () => {
    const parsed = await service.readSource(
      p,
      c,
      (await service.state(actor, p, c)).sources[0],
    );
    parsed.sheets[0].rows.push({
      number: 3,
      cells: ['둘째', '3*3', '9', 'm2'],
      hidden: false,
    });
    vi.spyOn(service, 'readSource').mockResolvedValue(parsed);
    mock.ai.mockImplementationOnce(async ({ rows }) => ({
      ai: { ...metadata, state: 'partial', totalRows: 2 },
      findings: [],
      coverage: [],
      limitations: [],
      checks: rows.map((r: { id: string }, i: number) => ({
        rowId: r.id,
        instructionId: 'rule-one',
        status: i ? 'pending' : 'not_flagged',
        reason: i ? '미전송' : '계산 일치',
      })),
    }));
    await execute(true);
    const parent = stored();
    vi.spyOn(service, 'runDetail').mockResolvedValue({
      run: parent,
      decisions: [],
    });
    mock.ai.mockImplementation(async ({ rows }) => ({
      ai: metadata,
      findings: [],
      coverage: [],
      limitations: [],
      checks: rows.map((r: { id: string }) => ({
        rowId: r.id,
        instructionId: 'rule-one',
        status: 'not_flagged',
        reason: '계산 일치',
      })),
    }));
    const continuation = () =>
      service.mutate(
        actor,
        p,
        {
          action: 'run',
          caseId: c,
          profileId: v,
          trial: false,
          includeAi: true,
          requestKey: crypto.randomUUID(),
          parentRunId: parent.id,
        },
        'continuation',
      );
    await continuation();
    expect(
      mock.ai.mock.calls[1][0].contextRows.map((r: { id: string }) => r.id),
    ).toEqual(parent.rows.map((r) => r.id));
    expect(
      mock.ai.mock.calls[1][0].rows.map((r: { id: string }) => r.id),
    ).toEqual([parent.rows[1].id]);
    expect(stored().aiChecks).toHaveLength(2);
    expect(stored().parentRunId).toBe(parent.id);
    expect(parent.aiChecks![1].status).toBe('pending');
    await expect(continuation()).rejects.toMatchObject({
      code: 'AI_CONTINUATION_STARTED',
    });
    expect(mock.ai).toHaveBeenCalledTimes(2);
  });
  it('records an unmapped sheet instead of silently treating a file as fully reviewed', async () => {
    const parsed = await service.readSource(
      p,
      c,
      (await service.state(actor, p, c)).sources[0],
    );
    vi.spyOn(service, 'readSource').mockResolvedValue({
      ...parsed,
      sheets: [
        ...parsed.sheets,
        {
          name: 'Missed',
          rows: [{ number: 1, cells: ['미매핑 자료'], hidden: false }],
        },
      ],
    });
    await execute(true);
    expect(stored().sourceAudit).toMatchObject({
      inspectedFiles: 1,
      totalSheets: 2,
      mappedSheets: 1,
    });
    expect(stored().sourceAudit!.issues).toContain(
      'synthetic.csv/Missed: 미매핑 시트',
    );
  });
  it('reads registered bytes, saves mapping and instructions, trials/activates, reruns and reloads an exportable report', async () => {
    // Only external storage and AI are doubles: no state/readSource service bypass.
    vi.restoreAllMocks();
    const bytes = new TextEncoder().encode(
      '품명,산식,물량,단위\n합성,2*3,9,m2\n',
    );
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    const registered = await new SourcePackageService(
      new D1SourcePackageRepository(),
    ).create(
      p,
      c,
      actor,
      {
        displayName: 'Synthetic complete cycle',
        files: [
          {
            filename: '산출서.csv',
            contentType: 'text/csv',
            sizeBytes: bytes.length,
            purpose: 'quantity_source',
          },
        ],
      },
      'synthetic-complete-cycle',
      crypto.randomUUID(),
    );
    const file = registered.files[0];
    // Fixture starts after the independently tested preparation transaction.
    fixture.sqlite
      .prepare(
        "UPDATE source_file_version SET status='stored',sha256=?,extension_detected='csv',content_type_detected='text/csv',validation_summary_json='{}',stored_at=1 WHERE id=?",
      )
      .run(hash, file.sourceVersionId);
    fixture.sqlite
      .prepare("UPDATE upload_attempt SET state='finalized' WHERE id=?")
      .run(file.uploadId);
    fixture.sqlite
      .prepare(
        "UPDATE source_package SET status='stored_unverified' WHERE id=?",
      )
      .run(registered.id);
    mock.source.mockImplementation(async () => ({
      body: bytes.buffer.slice(0),
      size: bytes.length,
      sha256: hash,
      contentType: 'text/csv',
    }));
    const objects = new Map<string, Uint8Array>();
    mock.put.mockImplementation(async (key: string, value: Uint8Array) => {
      objects.set(key, value.slice());
    });
    mock.get.mockImplementation(async (key: string) => {
      const value = objects.get(key);
      return value
        ? { size: value.length, arrayBuffer: async () => value.slice().buffer }
        : null;
    });
    const inspect = await service.inspect(actor, p, c, file.sourceVersionId);
    const mapping: Mapping = {
      ...inspect.sheets[0].suggested,
      columns: {
        ...Object.fromEntries(fields.map((f) => [f, null])),
        item: 0,
        formula: 1,
        quantity: 2,
        unit: 3,
      } as Mapping['columns'],
      headerRow: 1,
      kind: 'detail',
      confirmed: true,
      arithmeticBasis: 'formula-result',
    };
    const command = (input: unknown) =>
      service.mutate(
        actor,
        p,
        reviewRequestSchema.parse(input),
        crypto.randomUUID(),
      );
    await command({
      action: 'mapping',
      caseId: c,
      baseVersionId: null,
      mappings: [mapping],
    });
    await command({ action: 'profile', caseId: c, profile });
    const draft = (await service.state(actor, p, c)).profiles.find(
      (entry) => entry.status === 'draft',
    )!;
    await command({
      action: 'run',
      caseId: c,
      profileId: draft.id,
      trial: true,
      includeAi: true,
      requestKey: crypto.randomUUID(),
    });
    const trial = (await service.state(actor, p, c)).runs.find(
      (entry) => entry.profileVersion === draft.version && entry.trial,
    )!;
    await command({
      action: 'approve',
      caseId: c,
      profileId: draft.id,
      trialRunId: trial.id,
    });
    await command({
      action: 'run',
      caseId: c,
      profileId: draft.id,
      trial: false,
      includeAi: true,
      requestKey: crypto.randomUUID(),
    });
    const formal = (await service.state(actor, p, c)).runs.find(
      (entry) => entry.profileVersion === draft.version && !entry.trial,
    )!;
    const reloaded = await service.runDetail(actor, p, c, formal.id);
    expect(reloaded.run.profile.instructions).toEqual(profile.instructions);
    expect(reloaded.run.rows[0].ref).toMatchObject({
      sourceVersionId: file.sourceVersionId,
      sha256: hash,
      row: 2,
    });
    expect(reloaded.run.ai?.state).toBe('completed');
    expect(reloaded.run.sourceAudit).toEqual({
      registeredFiles: 1,
      inspectedFiles: 1,
      totalSheets: 1,
      mappedSheets: 1,
      issues: [],
    });
    expect(mock.ai).toHaveBeenCalledTimes(2);
    const workbook = readWorkbook(
      exportReview(reloaded.run, reloaded.decisions),
      'xlsx',
    );
    expect(JSON.stringify(workbook)).toContain(formal.id);
    expect(JSON.stringify(workbook)).toContain(hash);
    expect(JSON.stringify(workbook)).toContain('합성 후보');
    expect(objects.size).toBe(2);
    await command({ action: 'save-report', caseId: c, runId: formal.id });
    const savedReport = [...objects.entries()].find(([key]) =>
      key.endsWith('.xlsx'),
    );
    expect(savedReport).toBeDefined();
    expect(readWorkbook(savedReport![1], 'xlsx')).toEqual(workbook);
    await command({ action: 'save-report', caseId: c, runId: formal.id });
    expect(objects.size).toBe(3);
    expect((await service.runDetail(actor, p, c, trial.id)).run.trial).toBe(
      true,
    );
  });
  it('keeps opt-out network-free and records unevaluated instructions', async () => {
    await execute(false);
    expect(mock.ai).not.toHaveBeenCalled();
    expect(mock.config).not.toHaveBeenCalled();
    expect(stored().ai).toBeUndefined();
    expect(stored().findings.some((f) => f.level === 'A')).toBe(true);
    expect(stored().coverage).toContainEqual(
      expect.objectContaining({ ruleId: 'AI-rule-one', evaluated: 0 }),
    );
  });
  it('persists AI metadata, source lineage and profile snapshot; rejects duplicate paid requests', async () => {
    await execute(true);
    const run = stored();
    expect(run.ai).toMatchObject({ ...metadata, settingsVersion: 7 });
    expect(run.profile.instructions).toEqual(profile.instructions);
    expect(run.rows[0].ref).toMatchObject({
      sourceVersionId: sourceId,
      sha256: 'synthetic-sha',
      row: 2,
    });
    expect(run.findings.some((f) => f.level === 'C')).toBe(true);
    expect(run.findings.some((f) => f.level === 'A')).toBe(true);
    expect(JSON.stringify(run)).not.toContain('synthetic-key-never-real');
    await expect(execute(true)).rejects.toMatchObject({
      code: 'AI_REQUEST_ALREADY_STARTED',
    });
    expect(mock.ai).toHaveBeenCalledTimes(1);
    expect(mock.put).toHaveBeenCalledTimes(1);
  });
  it('preserves deterministic findings when AI reports provider failure', async () => {
    mock.ai.mockResolvedValue({
      ai: { ...metadata, state: 'failed', evaluatedRows: 0 },
      findings: [],
      coverage: [],
      limitations: ['합성 공급자 실패'],
    });
    await execute(true);
    expect(stored().ai?.state).toBe('failed');
    expect(stored().findings.some((f) => f.level === 'A')).toBe(true);
    expect(stored().limitations).toContain('합성 공급자 실패');
  });
  it('rejects employee guideline drafting before AI execution', async () => {
    await expect(
      service.mutate(
        { ...actor, email: 'staff@example.invalid' },
        p,
        reviewRequestSchema.parse({ action: 'profile', caseId: c, profile }),
        'request',
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(mock.ai).not.toHaveBeenCalled();
  });
  it('rejects approval when enabled AI instruction has not been trial-evaluated', async () => {
    await execute(false);
    vi.spyOn(service, 'runDetail').mockResolvedValue({
      run: stored(),
      decisions: [],
    });
    await expect(
      service.mutate(
        actor,
        p,
        { action: 'approve', caseId: c, profileId: v, trialRunId: 'trial' },
        'request',
      ),
    ).rejects.toMatchObject({ code: 'AI_TRIAL_REQUIRED' });
  });
});
