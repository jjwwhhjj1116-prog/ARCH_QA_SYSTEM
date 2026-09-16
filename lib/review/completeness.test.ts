import { describe, expect, it } from 'vitest';
import { defaultProfile, type Run } from './contracts';
import { reviewCompleteness } from './completeness';
function run(): Run {
  return {
    profile: {
      ...defaultProfile,
      instructions: [{ id: 'a', text: '검사', enabled: true }],
    },
    rows: [{ id: 'r' }],
    aiChecks: [
      { rowId: 'r', instructionId: 'a', status: 'not_flagged', reason: '' },
    ],
    sourceAudit: {
      registeredFiles: 1,
      inspectedFiles: 1,
      totalSheets: 1,
      mappedSheets: 1,
      issues: [],
    },
    ai: {
      state: 'completed',
      totalRows: 1,
      evaluatedRows: 1,
      contextComplete: true,
    },
    coverage: [{ ruleId: 'AI-a', evaluated: 1, unevaluated: 0 }],
  } as unknown as Run;
}
describe('full registered-source completion gate', () => {
  it('requires recorded complete comparison context', () => {
    const value = run();
    delete value.ai!.contextComplete;
    expect(reviewCompleteness(value).complete).toBe(false);
    value.ai!.contextComplete = false;
    expect(reviewCompleteness(value).complete).toBe(false);
  });
  it('rejects coverage counters inconsistent with a complete ledger', () => {
    const value = run();
    value.coverage[0].evaluated = 2;
    value.coverage[0].unevaluated = -1;
    expect(reviewCompleteness(value).complete).toBe(false);
  });
  it.each([-1, 0, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid inventory %s',
    (count) => {
      const value = run();
      value.sourceAudit!.registeredFiles = value.sourceAudit!.inspectedFiles =
        count;
      value.sourceAudit!.totalSheets = value.sourceAudit!.mappedSheets = count;
      expect(reviewCompleteness(value).complete).toBe(false);
    },
  );
  it('rejects a missing row replaced with duplicate completed records', () => {
    const value = run();
    value.rows.push({ ...value.rows[0], id: 's' });
    value.aiChecks!.push({ ...value.aiChecks![0] });
    value.ai!.totalRows = value.ai!.evaluatedRows = 2;
    value.coverage[0].evaluated = 2;
    expect(reviewCompleteness(value).complete).toBe(false);
  });
  it('checks 20,000 rows and 10 instructions without modifying the run', () => {
    const value = run();
    value.rows = Array.from({ length: 20000 }, (_, n) => ({
      ...value.rows[0],
      id: String(n),
    }));
    value.profile.instructions = Array.from({ length: 10 }, (_, n) => ({
      id: String(n),
      text: '검사',
      enabled: true,
    }));
    value.aiChecks = value.rows.flatMap((row) =>
      value.profile.instructions!.map((i) => ({
        rowId: row.id,
        instructionId: i.id,
        status: 'not_flagged' as const,
        reason: '',
      })),
    );
    value.coverage = value.profile.instructions.map((i) => ({
      ...value.coverage[0],
      ruleId: `AI-${i.id}`,
      evaluated: 20000,
      unevaluated: 0,
    }));
    value.ai!.totalRows = value.ai!.evaluatedRows = 20000;
    const started = performance.now();
    expect(reviewCompleteness(value)).toMatchObject({
      complete: true,
      evaluatedPairs: 200000,
      totalPairs: 200000,
    });
    console.info(
      JSON.stringify({
        kind: 'local-ledger-validation',
        rows: 20000,
        pairs: 200000,
        elapsedMs: Math.round(performance.now() - started),
      }),
    );
    expect(value.aiChecks).toHaveLength(200000);
  });
  it.each(['pending', 'failed', 'unable', 'excluded'] as const)(
    'rejects %s ledger despite completed counters',
    (status) => {
      const value = run();
      value.aiChecks![0].status = status;
      expect(reviewCompleteness(value)).toMatchObject({
        complete: false,
        evaluatedPairs: 0,
      });
    },
  );
  it('rejects absent and empty ledgers despite completed counters', () => {
    const value = run();
    delete value.aiChecks;
    expect(reviewCompleteness(value).complete).toBe(false);
    value.aiChecks = [];
    expect(reviewCompleteness(value).complete).toBe(false);
  });
  it.each(['rowId', 'instructionId'] as const)('rejects foreign %s', (key) => {
    const value = run();
    value.aiChecks![0][key] = 'foreign';
    expect(reviewCompleteness(value)).toMatchObject({
      complete: false,
      evaluatedPairs: 0,
    });
  });
  it('does not count duplicate records or mutate history', () => {
    const value = run();
    value.aiChecks!.push({ ...value.aiChecks![0] });
    const before = JSON.stringify(value);
    expect(reviewCompleteness(value)).toMatchObject({
      complete: false,
      evaluatedPairs: 0,
    });
    expect(JSON.stringify(value)).toBe(before);
  });
  it('rejects duplicate target identifiers', () => {
    const value = run();
    value.rows.push(value.rows[0]);
    expect(reviewCompleteness(value).complete).toBe(false);
    const other = run();
    other.profile.instructions!.push(other.profile.instructions![0]);
    expect(reviewCompleteness(other).complete).toBe(false);
  });
  it('accepts suspected as processed, not as approval', () => {
    const value = run();
    value.aiChecks![0].status = 'suspected';
    expect(reviewCompleteness(value)).toMatchObject({
      complete: true,
      evaluatedPairs: 1,
    });
    expect(reviewCompleteness(value).label).toContain('승인 의미 아님');
  });
  it('requires source census and every row/instruction', () => {
    expect(reviewCompleteness(run()).complete).toBe(true);
  });
  it('never upgrades old successful runs without a source census', () => {
    const value = run();
    delete value.sourceAudit;
    expect(reviewCompleteness(value).complete).toBe(false);
  });
  it.each(['registeredFiles', 'totalSheets'] as const)(
    'rejects missing %s',
    (key) => {
      const value = run();
      value.sourceAudit![key] = 2;
      expect(reviewCompleteness(value).complete).toBe(false);
    },
  );
  it('rejects an unprocessed second instruction even if every row was counted once', () => {
    const value = run();
    value.profile.instructions!.push({
      id: 'b',
      text: '추가 지침',
      enabled: true,
    });
    expect(reviewCompleteness(value)).toMatchObject({
      complete: false,
      totalPairs: 2,
      evaluatedPairs: 1,
    });
  });
  it('rejects 60/61 bounded samples', () => {
    const value = run();
    value.rows = Array.from({ length: 61 }, (_, id) => ({
      id: String(id),
    })) as Run['rows'];
    value.ai = {
      ...value.ai!,
      totalRows: 61,
      evaluatedRows: 60,
      state: 'partial',
    };
    value.coverage[0] = { ...value.coverage[0], evaluated: 60, unevaluated: 1 };
    expect(reviewCompleteness(value).complete).toBe(false);
  });
  it.each(['partial', 'failed'] as const)(
    'rejects %s responses despite complete counters',
    (state) => {
      const value = run();
      value.ai!.state = state;
      expect(reviewCompleteness(value).complete).toBe(false);
    },
  );
  it('preserves exclusions and integrity warnings as incomplete', () => {
    const value = run();
    value.sourceAudit!.issues.push('중복 제외 · 확인 필요');
    expect(reviewCompleteness(value).issues).toContain('중복 제외 · 확인 필요');
  });
});
