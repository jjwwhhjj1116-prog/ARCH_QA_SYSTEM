import type { Run, AiCheck } from './contracts';
import type { reviewWithGemini } from './gemini-review';
import { AI_REVIEW_PROMPT_VERSION } from './gemini-review';

export function applyAiProgress(
  run: Run,
  result: Awaited<ReturnType<typeof reviewWithGemini>>,
  parent?: Run,
) {
  // Legacy synthetic adapters may not return a ledger. Never fabricate one.
  if (!result.checks) return;
  const contextComplete =
    result.contextComplete === true &&
    (!parent ||
      (parent.ai?.promptVersion === AI_REVIEW_PROMPT_VERSION &&
        parent.ai.contextComplete === true));
  if (!contextComplete)
    run.sourceAudit?.issues.push('분할 묶음 간 AI 교차 비교 미검증');
  if (parent?.sourceAudit?.issues.length)
    run.sourceAudit?.issues.push(...parent.sourceAudit.issues);
  const entries = new Map(
    (parent?.aiChecks ?? []).map((c) => [
      JSON.stringify([c.rowId, c.instructionId]),
      c,
    ]),
  );
  for (const check of result.checks)
    entries.set(JSON.stringify([check.rowId, check.instructionId]), check);
  run.aiChecks = [...entries.values()];
  const evaluated = (c: AiCheck) =>
    c.status === 'suspected' || c.status === 'not_flagged';
  const instructions = run.profile.instructions?.filter((i) => i.enabled) ?? [];
  const coverage = instructions.map((i) => {
    const checks = run.aiChecks!.filter((c) => c.instructionId === i.id);
    const count = checks.filter(evaluated).length;
    return {
      ruleId: `AI-${i.id}`,
      label: `AI 지침 · ${i.id}`,
      evaluated: count,
      unevaluated: run.rows.length - count,
      reasons: [
        ...new Set(
          checks
            .filter((c) => !evaluated(c))
            .map((c) => `${c.status}: ${c.reason}`),
        ),
      ],
    };
  });
  run.coverage = [
    ...run.coverage.filter((c) => !c.ruleId.startsWith('AI-')),
    ...coverage,
  ];
  const evaluatedRows = run.rows.filter((row) =>
    instructions.every((i) => {
      const check = entries.get(JSON.stringify([row.id, i.id]));
      return check && evaluated(check);
    }),
  ).length;
  run.ai!.evaluatedRows = evaluatedRows;
  run.ai!.totalRows = run.rows.length;
  run.ai!.contextComplete = contextComplete;
  run.ai!.state =
    contextComplete &&
    evaluatedRows === run.rows.length &&
    result.ai.state === 'completed'
      ? 'completed'
      : evaluatedRows > 0
        ? 'partial'
        : result.ai.state === 'failed'
          ? 'failed'
          : 'partial';
  if (parent?.ai) {
    run.ai!.inputTokens =
      parent.ai.inputTokens === null || result.ai.inputTokens === null
        ? null
        : parent.ai.inputTokens + result.ai.inputTokens;
    run.ai!.outputTokens =
      parent.ai.outputTokens === null || result.ai.outputTokens === null
        ? null
        : parent.ai.outputTokens + result.ai.outputTokens;
    run.findings.push(
      ...parent.findings.filter((f) => f.ruleId.startsWith('AI-')),
    );
    run.parentRunId = parent.id;
    run.limitations.push(
      '이전 묶음 결과를 보존해 합쳤습니다. 실패·판단불가 항목을 자동 재호출하지 않습니다.',
    );
    run.limitations.push(
      '비교 문맥의 전체 전달 여부는 등록 자료 대조 결과에서 확인하세요. AI 판단의 정확성은 원본과 대조해야 합니다.',
    );
  }
}
