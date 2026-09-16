// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fields, type CanonicalRow } from './contracts';
import { reviewWithGemini } from './gemini-review';
import { applyAiProgress } from './ai-progress';
import { defaultProfile, type Run } from './contracts';

const instructions = [
  { id: 'D1', text: '입력 근거가 부족하면 검수 불가로 표시', enabled: true },
];
function row(id = 'r1'): CanonicalRow {
  return {
    id,
    kind: 'detail',
    excluded: null,
    original: ['PRIVATE ORIGINAL'],
    fieldRefs: {},
    ref: {
      sourceVersionId: 'private-source',
      filename: 'PRIVATE.xlsx',
      sha256: 'private-hash',
      sheet: 'PRIVATE SHEET',
      row: 2,
      cell: 'A2',
    },
    values: {
      ...Object.fromEntries(fields.map((f) => [f, ''])),
      item: '벽 미장',
      unit: 'm2',
      quantity: '600',
      formula: '100*3*2',
    } as CanonicalRow['values'],
    mapping: {
      sourceVersionId: 'private-source',
      sheet: 'PRIVATE SHEET',
      headerRow: 1,
      kind: 'detail',
      columns: Object.fromEntries(
        fields.map((f) => [f, null]),
      ) as CanonicalRow['mapping']['columns'],
      confirmed: true,
      arithmeticBasis: 'unknown',
      dimensionRole: 'unknown',
      dimensionUnit: '',
      cohortConfirmed: false,
    },
  };
}
function check(rowId = 'R1', status = 'not_flagged', instructionId = 'D1') {
  return {
    rowId,
    instructionId,
    status,
    reason: '제공된 값만 검토',
    evidence: ['산식 100*3*2'],
  };
}
function response(checks: unknown[], finishReason = 'STOP') {
  return Response.json({
    candidates: [
      {
        finishReason,
        content: { parts: [{ text: JSON.stringify({ checks }) }] },
      },
    ],
    usageMetadata: {
      promptTokenCount: 100,
      candidatesTokenCount: 20,
      thoughtsTokenCount: 5,
    },
  });
}
function run(fetcher: typeof fetch, rows = [row()], rules = instructions) {
  return reviewWithGemini({
    apiKey: 'synthetic-key',
    model: 'gemini-test-flash',
    rows,
    instructions: rules,
    fetcher,
  });
}
afterEach(() => vi.useRealTimers());

describe('bounded Gemini evidence review', () => {
  it('leaves invented evidence aliases unevaluated', async () => {
    const result = await run(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          response([
            { ...check('R1', 'suspected'), evidence: ['C999와 중복'] },
          ]),
        ),
    );
    expect(result.checks[0].status).toBe('unable');
    expect(result.coverage[0].evaluated).toBe(0);
    expect(result.findings).toHaveLength(0);
  });
  it.each(['excluded', 'mapping', 'long', 'duplicate'] as const)(
    'does not hide %s comparison context',
    async (kind) => {
      const target = row('target');
      const peer = row('peer');
      if (kind === 'excluded') peer.excluded = '범위 제외';
      if (kind === 'mapping') peer.mapping.confirmed = false;
      if (kind === 'long') peer.values.formula = '1'.repeat(1001);
      const result = await reviewWithGemini({
        apiKey: 'synthetic-key',
        model: 'gemini-test-flash',
        rows: [target],
        contextRows:
          kind === 'duplicate' ? [target, peer, peer] : [target, peer],
        instructions,
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(response([check()])),
      });
      expect(result.contextComplete).toBe(false);
      expect(result.ai.state).toBe('partial');
    },
  );
  it('links comparison aliases to original peers', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response([
          { ...check('R1', 'suspected'), evidence: ['C1과 중복 후보'] },
        ]),
      );
    const result = await reviewWithGemini({
      apiKey: 'synthetic-key',
      model: 'gemini-test-flash',
      rows: [row('target')],
      contextRows: [row('target'), row('peer')],
      instructions,
      fetcher,
    });
    expect(result.contextComplete).toBe(true);
    expect(result.findings[0].peerIds).toEqual(['peer']);
    expect(result.findings[0].evidence.join(' ')).toContain('원본 행 peer');
    expect(result.checks).toHaveLength(1);
    expect(fetcher.mock.calls[0][1]!.body as string).not.toContain('PRIVATE');
  });
  it('rejects a check returned for comparison-only aliases', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response([check('C1')]));
    const result = await reviewWithGemini({
      apiKey: 'synthetic-key',
      model: 'gemini-test-flash',
      rows: [row('target')],
      contextRows: [row('target'), row('peer')],
      instructions,
      fetcher,
    });
    expect(result.ai.state).toBe('failed');
  });
  it('keeps oversized comparison context incomplete and bounded', async () => {
    const all = Array.from({ length: 20000 }, (_, i) => row(String(i)));
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response([check()]));
    const result = await reviewWithGemini({
      apiKey: 'synthetic-key',
      model: 'gemini-test-flash',
      rows: [all[0]],
      contextRows: all,
      instructions,
      fetcher,
    });
    expect(result.contextComplete).toBe(false);
    expect(result.ai.contextComplete).toBe(false);
    expect(result.ai.state).toBe('partial');
    expect(
      new TextEncoder().encode(fetcher.mock.calls[0][1]!.body as string).length,
    ).toBeLessThanOrEqual(48 * 1024);
    const parent = {
      rows: all,
      profile: { ...defaultProfile, instructions },
      ai: { ...result.ai },
      findings: [],
      coverage: [],
      limitations: [],
      sourceAudit: { issues: [] },
    } as unknown as Run;
    applyAiProgress(parent, result);
    const child = {
      ...parent,
      ai: { ...result.ai },
      findings: [],
      coverage: [],
      limitations: [],
      sourceAudit: { ...parent.sourceAudit!, issues: [] },
    };
    applyAiProgress(child, { ...result, contextComplete: true }, parent);
    expect(child.ai.contextComplete).toBe(false);
    expect(child.sourceAudit.issues).toContain(
      '분할 묶음 간 AI 교차 비교 미검증',
    );
  });
  it.each(['missing', 'false', 'old-version'])(
    'does not promote fully answered rows with %s parent context to completed',
    async (kind) => {
      const result = await run(
        vi.fn<typeof fetch>().mockResolvedValue(response([check()])),
      );
      expect(result.ai.state).toBe('completed');
      const parent = {
        rows: [row()],
        profile: { ...defaultProfile, instructions },
        ai: { ...result.ai },
        aiChecks: result.checks,
        findings: [],
        coverage: [],
        limitations: [],
        sourceAudit: { issues: [] },
      } as unknown as Run;
      if (kind === 'missing') delete parent.ai!.contextComplete;
      if (kind === 'false') parent.ai!.contextComplete = false;
      if (kind === 'old-version') parent.ai!.promptVersion = 'legacy';
      const before = structuredClone(parent);
      const child = {
        ...parent,
        ai: { ...result.ai },
        findings: [],
        limitations: [],
        sourceAudit: { ...parent.sourceAudit!, issues: [] },
      };
      applyAiProgress(child, result, parent);
      expect(child.ai.evaluatedRows).toBe(1);
      expect(child.ai.state).toBe('partial');
      expect(child.ai.contextComplete).toBe(false);
      expect(parent).toEqual(before);
    },
  );
  it('keeps all 65 rows in the ledger and resumes only the 5 unsent rows', async () => {
    const rows = Array.from({ length: 65 }, (_, i) => row(`row-${i}`));
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        const payload = JSON.parse(
          JSON.parse(init!.body as string).contents[0].parts[0].text,
        );
        return response(payload.rows.map((r: { id: string }) => check(r.id)));
      });
    const first = await run(fetcher, rows);
    expect(first.checks.filter((c) => c.status === 'pending')).toHaveLength(5);
    expect(first.checks.filter((c) => c.status === 'not_flagged')).toHaveLength(
      60,
    );
    const parent = {
      id: 'first',
      rows,
      profile: { ...defaultProfile, instructions },
      findings: first.findings,
      coverage: first.coverage,
      limitations: [],
      ai: first.ai,
    } as unknown as Run;
    applyAiProgress(parent, first);
    const pending = new Set(
      parent
        .aiChecks!.filter((c) => c.status === 'pending')
        .map((c) => c.rowId),
    );
    const remaining = rows.filter((r) => pending.has(r.id));
    expect(remaining.map((r) => r.id)).toEqual([
      'row-60',
      'row-61',
      'row-62',
      'row-63',
      'row-64',
    ]);
    const second = await reviewWithGemini({
      apiKey: 'synthetic-key',
      model: 'gemini-test-flash',
      rows: remaining,
      contextRows: rows,
      instructions,
      fetcher,
    });
    const payloads = fetcher.mock.calls.map(([, init]) =>
      JSON.parse(JSON.parse(init!.body as string).contents[0].parts[0].text),
    );
    expect(payloads[0].comparisonRows).toHaveLength(5);
    expect(payloads[1].comparisonRows).toHaveLength(60);
    expect(first.contextComplete).toBe(true);
    expect(second.contextComplete).toBe(true);
    const combined = {
      ...parent,
      id: 'second',
      findings: [...second.findings],
      coverage: [...second.coverage],
      limitations: [],
      ai: { ...second.ai },
    };
    applyAiProgress(combined, second, parent);
    expect(combined.aiChecks).toHaveLength(65);
    expect(combined.aiChecks!.every((c) => c.status === 'not_flagged')).toBe(
      true,
    );
    expect(combined.ai.evaluatedRows).toBe(65);
    expect(parent.aiChecks!.filter((c) => c.status === 'pending')).toHaveLength(
      5,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('records failed transmitted rows separately from unsent rows', async () => {
    const result = await run(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{}', { status: 503 })),
      Array.from({ length: 65 }, (_, i) => row(String(i))),
    );
    expect(result.checks.filter((c) => c.status === 'failed')).toHaveLength(60);
    expect(result.checks.filter((c) => c.status === 'pending')).toHaveLength(5);
  });
  it('backs off only confirmed Google 503 and preserves the exact request', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 503,
          headers: { 'x-qc-gemini-response': 'upstream' },
        }),
      )
      .mockResolvedValueOnce(response([check()]));
    const pending = run(fetcher);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;
    expect(result.ai.state).toBe('completed');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]).toEqual(fetcher.mock.calls[0]);
    expect(result.limitations.join(' ')).toContain('재시도 1/2');
  });
  it('stops after three confirmed 503 responses', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(null, {
          status: 503,
          headers: { 'x-qc-gemini-response': 'upstream' },
        }),
    );
    const pending = run(fetcher);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(3000);
    const result = await pending;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.ai.state).toBe('failed');
    expect(result.coverage[0].evaluated).toBe(0);
  });
  it.each(['120', 'invalid'])(
    'does not retry against Retry-After %s',
    async (retryAfter) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          status: 503,
          headers: {
            'x-qc-gemini-response': 'upstream',
            'retry-after': retryAfter,
          },
        }),
      );
      expect((await run(fetcher)).ai.state).toBe('failed');
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('does not send another request if the total deadline expires during backoff', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                new Response(null, {
                  status: 503,
                  headers: { 'x-qc-gemini-response': 'upstream' },
                }),
              ),
            59_500,
          );
        }),
    );
    const pending = run(fetcher);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(61_000);
    expect((await pending).ai.state).toBe('failed');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('preserves unable reasons and distinguishes missing responses without marking either evaluated', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response([
          { ...check('R1', 'unable'), reason: '변수 H의 정의 없음' },
          check('R2'),
        ]),
      );
    const result = await run(fetcher, [row('one'), row('two'), row('three')]);
    expect(result.coverage[0]).toMatchObject({ evaluated: 1, unevaluated: 2 });
    expect(result.coverage[0].reasons.join('\n')).toContain(
      'AI 판단 불가(미확정): 변수 H의 정의 없음',
    );
    expect(result.coverage[0].reasons.join('\n')).toContain('AI 응답 누락');
    expect(result.coverage[0].reasons.join('\n')).toContain(
      'PRIVATE.xlsx · PRIVATE SHEET · 2행',
    );
    expect(result.ai.state).toBe('partial');
    expect(result.findings).toHaveLength(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('uses opaque IDs externally and restores the exact local source ID', async () => {
    const id = 'PRIVATE.xlsx:PRIVATE-SHEET:125';
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response([check('R1', 'suspected')]));
    const result = await run(fetcher, [row(id)]);
    expect(fetcher.mock.calls[0][1]?.body).not.toContain(id);
    expect(
      JSON.parse(fetcher.mock.calls[0][1]?.body as string).generationConfig,
    ).not.toHaveProperty('temperature');
    expect(result.findings[0].rowId).toBe(id);
  });

  it('rejects duplicate source IDs before making a paid request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await run(fetcher, [row(), row()]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.ai.state).toBe('failed');
    expect(result.coverage[0].unevaluated).toBe(2);
  });

  it('never retries a network exception or returns its message', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('synthetic-key SECRET'));
    const result = await run(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/synthetic-key|SECRET/);
    expect(result.coverage[0].evaluated).toBe(0);
  });

  it('sends only selected values, preserves sources and returns Level C candidates with token metadata', async () => {
    const rows = [row()];
    const before = structuredClone(rows);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response([check('R1', 'suspected')]));
    const result = await run(fetcher, rows);
    expect(result.findings[0]).toMatchObject({
      rowId: 'r1',
      ruleId: 'AI-D1',
      level: 'C',
      confidence: 'candidate',
      peerIds: [],
    });
    expect(result.ai).toMatchObject({
      state: 'completed',
      evaluatedRows: 1,
      totalRows: 1,
      inputTokens: 100,
      outputTokens: 25,
      costUsd: null,
    });
    expect(result.ai.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rows).toEqual(before);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-flash:generateContent',
    );
    expect(init).toMatchObject({
      redirect: 'manual',
      headers: { 'x-goog-api-key': 'synthetic-key' },
    });
    expect(init?.body).not.toMatch(
      /PRIVATE|private-source|private-hash|synthetic-key/,
    );
    const second = await run(
      vi.fn<typeof fetch>().mockResolvedValue(response([check()])),
    );
    expect(second.ai.inputHash).toBe(result.ai.inputHash);
    expect(second.findings).toEqual([]);
    expect(second.limitations.join(' ')).toContain('정상 확정이 아니');
  });

  it.each([
    [check('unknown', 'suspected')],
    [check('R1', 'suspected', 'foreign')],
    [check(), check()],
    [{ ...check('R1', 'suspected'), evidence: [] }],
    [{ ...check(), status: 'normal' }],
  ])(
    'rejects untrusted or invalid checks without fabricated normal coverage',
    async (...checks) => {
      const result = await run(
        vi.fn<typeof fetch>().mockResolvedValue(response(checks)),
      );
      expect(result.ai.state).toBe('failed');
      expect(result.findings).toEqual([]);
      expect(result.coverage[0]).toMatchObject({
        evaluated: 0,
        unevaluated: 1,
      });
    },
  );

  it('marks omitted and unable pairs unevaluated', async () => {
    const result = await run(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(response([check(), check('R2', 'unable')])),
      [row(), row('r2'), row('r3')],
    );
    expect(result.ai).toMatchObject({
      state: 'partial',
      evaluatedRows: 1,
      totalRows: 3,
    });
    expect(result.coverage[0]).toMatchObject({ evaluated: 1, unevaluated: 2 });
  });

  it('does not send excluded, unconfirmed or overlong values, and never truncates numbers', async () => {
    const excluded = { ...row('excluded'), excluded: '범위 제외' };
    const unconfirmed = row('unconfirmed');
    unconfirmed.mapping.confirmed = false;
    const long = row('long');
    long.values.formula = '1'.repeat(1001);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response([check()]));
    const result = await run(fetcher, [row(), excluded, unconfirmed, long]);
    const payload = JSON.parse(
      JSON.parse(fetcher.mock.calls[0][1]?.body as string).contents[0].parts[0]
        .text,
    );
    expect(payload.rows.map((r: { id: string }) => r.id)).toEqual(['R1']);
    expect(result.coverage[0]).toMatchObject({ evaluated: 1, unevaluated: 3 });
  });

  it('caps 60 rows and 10 instructions with explicit remaining coverage', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([]));
    const result = await run(
      fetcher,
      Array.from({ length: 61 }, (_, n) => row(`r${n}`)),
      Array.from({ length: 11 }, (_, n) => ({
        ...instructions[0],
        id: `D${n}`,
      })),
    );
    const payload = JSON.parse(
      JSON.parse(fetcher.mock.calls[0][1]?.body as string).contents[0].parts[0]
        .text,
    );
    expect(payload.rows).toHaveLength(6);
    expect(payload.instructions).toHaveLength(10);
    expect(result.coverage).toHaveLength(11);
    expect(result.ai.state).toBe('partial');
    expect(result.limitations.join(' ')).toContain('48KiB');
  });

  it('limits complete UTF8 request to 48 KiB and skips oversized instruction text', async () => {
    const rows = Array.from({ length: 60 }, (_, n) => {
      const r = row(`r${n}`);
      r.values.item = '한'.repeat(1000);
      return r;
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([]));
    const result = await run(fetcher, rows, [
      ...instructions,
      { id: 'long', text: 'x'.repeat(1001), enabled: true },
    ]);
    const body = fetcher.mock.calls[0][1]?.body as string;
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(
      48 * 1024,
    );
    const payload = JSON.parse(JSON.parse(body).contents[0].parts[0].text);
    expect(payload.rows.length).toBeLessThan(60);
    expect(payload.instructions).toHaveLength(1);
    expect(result.coverage[1].unevaluated).toBe(60);
  });

  it.each([{ rules: [] }, { rules: [{ ...instructions[0], enabled: false }] }])(
    'does not call external AI without active instructions',
    async ({ rules }) => {
      const fetcher = vi.fn<typeof fetch>();
      const result = await run(fetcher, [row()], rules);
      expect(fetcher).not.toHaveBeenCalled();
      expect(result.ai.state).toBe('failed');
      expect(result.coverage[0].unevaluated).toBe(1);
    },
  );

  it.each(['upstream', 'SECRET-HEADER', ''])(
    'records only fixed response provenance for 5xx: %s',
    async (origin) => {
      const result = await run(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response('SECRET-BODY', {
            status: 503,
            headers: { 'x-qc-gemini-response': origin },
          }),
        ),
      );
      const text = result.limitations.join(' ');
      expect(text).toContain('503');
      expect(text).toContain(
        origin === 'upstream'
          ? 'GOOGLE_HTTP_RESPONSE'
          : 'UNCONFIRMED_RESPONSE_ORIGIN',
      );
      expect(text).not.toContain('SECRET-');
    },
  );
  it.each([
    [302, '다른 주소'],
    [400, '요청 형식'],
    [401, '인증 또는 사용 권한'],
    [403, '인증 또는 사용 권한'],
    [404, '선택 모델'],
    [429, '할당량'],
    [500, '공급자 서버'],
    [503, '공급자 서버'],
  ] as const)(
    'rejects HTTP %i with safe actionable guidance without exposing upstream content or retrying',
    async (status, guidance) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('SECRET-UPSTREAM', {
          status,
          headers: { location: 'https://evil.example/' },
        }),
      );
      const result = await run(fetcher);
      expect(result.ai.state).toBe('failed');
      expect(JSON.stringify(result)).not.toContain('SECRET-UPSTREAM');
      expect(JSON.stringify(result)).not.toContain('evil.example');
      expect(result.limitations.join(' ')).toContain(guidance);
      expect(result.limitations.join(' ')).toContain(
        '자동 재시도하지 않습니다',
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    [
      {
        message:
          'User location is not supported SECRET-KEY https://private.example',
      },
      'GOOGLE_USER_LOCATION_UNSUPPORTED',
    ],
    [
      {
        message: 'SECRET-KEY',
        details: [
          {
            reason: 'API_KEY_INVALID',
            metadata: { secret: 'SECRET-METADATA' },
          },
        ],
      },
      'GOOGLE_API_KEY_INVALID',
    ],
  ])(
    'records only fixed shared diagnostic for known upstream rejection',
    async (error, diagnostic) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ error }, { status: 400 }));
      const result = await run(fetcher);
      expect(result.ai.state).toBe('failed');
      expect(result.ai.evaluatedRows).toBe(0);
      expect(result.findings).toEqual([]);
      expect(result.limitations.join(' ')).toContain(diagnostic);
      expect(result.coverage[0].reasons.join(' ')).toContain(diagnostic);
      expect(result.limitations.join(' ')).toContain(
        '자동 재시도하지 않습니다',
      );
      expect(JSON.stringify(result)).not.toMatch(
        /SECRET-|private\.example|User location is not supported/,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('separates network failure from invalid provider response without leaking exception text', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('SECRET-KEY https://private.example'));
    const result = await run(fetcher);
    expect(result.limitations.join(' ')).toContain('네트워크 연결');
    expect(JSON.stringify(result)).not.toContain('SECRET-KEY');
    expect(JSON.stringify(result)).not.toContain('private.example');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects an already redirected response', async () => {
    const redirected = response([check()]);
    Object.defineProperty(redirected, 'redirected', { value: true });
    expect(
      (await run(vi.fn<typeof fetch>().mockResolvedValue(redirected))).ai.state,
    ).toBe('failed');
  });

  it.each(['x'.repeat(256 * 1024 + 1), 'not json'])(
    'rejects oversized or malformed provider response',
    async (body) => {
      const result = await run(
        vi.fn<typeof fetch>().mockResolvedValue(new Response(body)),
      );
      expect(result.ai.state).toBe('failed');
      expect(result.limitations.join(' ')).toContain('응답 형식·크기');
    },
  );

  it('aborts a stalled call after 60 seconds without retry', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise(() => {}));
    const pending = run(fetcher);
    // SHA-256 uses the native crypto task queue before the timer is installed.
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(60_001);
    const result = await pending;
    expect(result.ai.state).toBe('failed');
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(result.limitations.join(' ')).toContain('60초');
  });

  it('marks valid truncated output partial even when all returned checks are evaluated', async () => {
    const result = await run(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(response([check()], 'MAX_TOKENS')),
    );
    expect(result.ai.state).toBe('partial');
    expect(result.limitations.join(' ')).toContain('출력 한도');
  });
});
