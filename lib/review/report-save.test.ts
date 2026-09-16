// @vitest-environment node
vi.mock('@/lib/server/ai/regional-fetch', () => ({
  regionalGeminiFetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, init),
}));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../../tests/helpers/sqlite-d1';
import { defaultProfile, type Decision, type Run } from './contracts';
import { exportReview } from './report';
import { unzipSync, strFromU8 } from 'fflate';
import { SaxesParser } from 'saxes';
import { canonicalRows, readWorkbook, suggestMapping } from './workbook';
const mock = vi.hoisted(() => ({
  db: null as D1Database | null,
  put: vi.fn(),
}));
vi.mock('@/db', () => ({ getD1Binding: () => mock.db }));
vi.mock('@/lib/files/review-storage', () => ({
  reviewStorage: () => ({ put: mock.put }),
}));
vi.mock('@/lib/files/r2-factory', () => ({ getPrivateFileStorage: vi.fn() }));
import { ReviewService, reviewRequestSchema } from './server';
const p = '10000000-0000-4000-8000-000000000001';
const c = '10000000-0000-4000-8000-000000000002';
const r = '10000000-0000-4000-8000-000000000003';
const actor = {
  id: 'u',
  email: 'staff@example.invalid',
  displayName: 'Synthetic',
  source: 'workspace' as const,
};
let fixture: ReturnType<typeof sqliteD1>, service: ReviewService;
let decisions: Decision[];
const run: Run = {
  id: r,
  projectId: p,
  caseId: c,
  actorId: 'u',
  createdAt: '2026-09-11T00:00:00Z',
  profileId: 'product-baseline',
  profileVersion: 1,
  profile: defaultProfile,
  trial: false,
  kind: 'baseline',
  engineVersion: 'synthetic',
  rows: [],
  sources: [],
  mappings: [],
  findings: [],
  coverage: [],
  limitations: ['합성 저장 시험 · 승인 아님'],
};
beforeEach(() => {
  fixture = sqliteD1();
  mock.db = fixture.db;
  vi.clearAllMocks();
  decisions = [];
  fixture.sqlite
    .prepare('INSERT INTO user_profile VALUES (?,?,?,0)')
    .run('u', actor.email, actor.displayName);
  fixture.sqlite
    .prepare("INSERT INTO project VALUES (?,?,?,NULL,'active','u',0)")
    .run(p, 'P', 'Synthetic');
  fixture.sqlite
    .prepare("INSERT INTO project_member VALUES ('m',?,'u','reviewer',0)")
    .run(p);
  fixture.sqlite
    .prepare(
      "INSERT INTO review_case VALUES (?,?,'Synthetic','FIN','draft','u',NULL,NULL,0)",
    )
    .run(c, p);
  service = new ReviewService();
  vi.spyOn(service, 'runDetail').mockImplementation(async () => ({
    run,
    decisions,
  }));
  mock.put.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  fixture.close();
});
const save = () =>
  service.mutate(
    actor,
    p,
    reviewRequestSchema.parse({ action: 'save-report', caseId: c, runId: r }),
    'same-client-request',
  );
describe('explicit private XLSX report persistence', () => {
  it('preserves long Korean evidence with emoji and CR across ordered cells', () => {
    const reason = '가'.repeat(29999) + '😀\r\n<&>=' + '나'.repeat(10000);
    const value = { ...run, limitations: [reason] };
    const bytes = exportReview(value, []);
    expect(exportReview(value, [])).toEqual(bytes);
    // Input workbook guards intentionally cap cells at 8KiB; inspect exported OOXML independently.
    const files = unzipSync(bytes);
    const parsed: { cells: string[] }[] = [];
    let cells: string[] = [],
      text = '',
      inText = false;
    const parser = new SaxesParser();
    parser.on('opentag', (tag) => {
      if (tag.name === 'row') cells = [];
      if (tag.name === 't') {
        text = '';
        inText = true;
      }
    });
    parser.on('text', (value) => {
      if (inText) text += value;
    });
    parser.on('closetag', (tag) => {
      if (tag.name === 't') {
        cells.push(text);
        inText = false;
      }
      if (tag.name === 'row') parsed.push({ cells });
    });
    parser.write(strFromU8(files['xl/worksheets/sheet5.xml'])).close();
    const pieces = parsed.slice(1);
    expect(pieces).toHaveLength(2);
    expect(pieces.map((r) => r.cells[3]).join('') === reason).toBe(true);
    expect(pieces.every((r) => r.cells[3].length <= 30000)).toBe(true);
    expect(pieces.map((r) => r.cells[2])).toEqual(['1', '2']);
    expect(strFromU8(files['xl/worksheets/sheet2.xml'])).toContain(
      '긴 셀 원문 시트 참조',
    );
    expect(value.limitations[0]).toBe(reason);
  });
  it('reconciles saved missing/duplicate checks and original row locations without changing history', async () => {
    const sheet = readWorkbook(
      new TextEncoder().encode(
        '품명,단위,산식,물량\n벽,m2,10*3,31\n벽,m2,10*3,30',
      ),
      'csv',
    )[0];
    const mapping = {
      ...suggestMapping(sheet, 'source', 'synthetic.csv'),
      confirmed: true,
    };
    const rows = canonicalRows(sheet, mapping, {
      sourceVersionId: 'source',
      filename: 'synthetic.csv',
      sha256: 'synthetic-sha',
    });
    expect(rows).toHaveLength(2);
    const value: Run = {
      ...run,
      rows,
      mappings: [mapping],
      sources: [rows[0].ref],
      profile: {
        ...defaultProfile,
        instructions: [{ id: 'a', text: '산식 대조', enabled: true }],
      },
      aiChecks: [
        {
          rowId: rows[0].id,
          instructionId: 'a',
          status: 'not_flagged',
          reason: '합성 응답',
        },
        {
          rowId: rows[0].id,
          instructionId: 'a',
          status: 'failed',
          reason: '합성 실패',
        },
      ],
      findings: [
        {
          id: 'f',
          ruleId: 'AI-a',
          rowId: rows[0].id,
          level: 'C',
          severity: 'check',
          confidence: 'candidate',
          title: '후보',
          evidence: ['합성 근거'],
          peerIds: [rows[1].id],
          limitation: '승인 아님',
        },
      ],
    };
    const snapshot = JSON.stringify(value);
    vi.spyOn(service, 'runDetail').mockResolvedValue({
      run: value,
      decisions: [],
    });
    await save();
    const workbook = readWorkbook(mock.put.mock.calls[0][1], 'xlsx');
    expect(workbook.map((s) => s.name)).toEqual([
      '검수 결과',
      '검수 범위와 제한',
      '판단 변경 이력',
      '원본 행 색인',
      '긴 셀 원문',
    ]);
    expect(workbook[1].rows.map((row) => row.cells)).toContainEqual([
      'missing',
      rows[1].id,
      'a',
      '처리 기록 없음 · 미검수',
    ]);
    expect(workbook[1].rows.map((row) => row.cells)).toContainEqual([
      'failed',
      rows[0].id,
      'a',
      '합성 실패',
    ]);
    expect(JSON.stringify(workbook[1].rows)).toContain('부분 검수');
    expect(workbook[3].rows).toHaveLength(3);
    expect(workbook[3].rows[1].cells.slice(0, 7)).toEqual([
      rows[0].id,
      'synthetic.csv',
      'source',
      'synthetic-sha',
      rows[0].ref.sheet,
      String(rows[0].ref.row),
      rows[0].ref.cell,
    ]);
    expect(workbook[3].rows[1].cells[7]).toBe(
      JSON.stringify(rows[0].fieldRefs),
    );
    expect(workbook[0].rows[1].cells.at(-1)).toContain(rows[1].id);
    expect(JSON.stringify(value)).toBe(snapshot);
  });
  it('stores frozen report bytes and checksum, reuses the snapshot key and audits only safe metadata', async () => {
    const first = await save();
    const second = await save();
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      saved: true,
      runId: r,
      format: 'xlsx',
      decisionCount: 0,
    });
    expect(mock.put.mock.calls[0][0]).toMatch(
      new RegExp(`/reviews/${r}/report-[a-f0-9]{64}\\.xlsx$`),
    );
    expect(mock.put.mock.calls[0][1]).toEqual(exportReview(run, []));
    expect(mock.put.mock.calls[1][0]).toBe(mock.put.mock.calls[0][0]);
    expect(
      fixture.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM audit_event WHERE action='review.report.saved'",
        )
        .get(),
    ).toEqual({ n: 2 });
  });
  it('keeps old snapshots when human decisions change', async () => {
    await save();
    decisions = [
      {
        id: 'decision',
        findingId: 'synthetic',
        disposition: 'hold',
        reason: '검토 보류',
        actorId: 'u',
        createdAt: '2026-09-11T01:00:00Z',
      },
    ];
    await save();
    expect(mock.put.mock.calls[1][0]).not.toBe(mock.put.mock.calls[0][0]);
  });
  it('does not claim saved or audit completion on storage failure and can retry', async () => {
    mock.put.mockRejectedValueOnce(new Error('synthetic storage outage'));
    await expect(save()).rejects.toThrow('synthetic storage outage');
    expect(
      fixture.sqlite.prepare('SELECT COUNT(*) n FROM audit_event').get(),
    ).toEqual({ n: 0 });
    await expect(save()).resolves.toMatchObject({ saved: true });
    expect(mock.put.mock.calls[1][0]).toBe(mock.put.mock.calls[0][0]);
  });
  it('rejects read-only members before reading or writing report bytes', async () => {
    fixture.sqlite.prepare("UPDATE project_member SET role='viewer'").run();
    await expect(save()).rejects.toMatchObject({ status: 403 });
    expect(mock.put).not.toHaveBeenCalled();
  });
  it('does not report completion if membership is revoked during storage', async () => {
    mock.put.mockImplementation(async () => {
      fixture.sqlite.prepare('DELETE FROM project_member').run();
    });
    await expect(save()).rejects.toMatchObject({ status: 403 });
    expect(
      fixture.sqlite.prepare('SELECT COUNT(*) n FROM audit_event').get(),
    ).toEqual({ n: 0 });
  });
});
