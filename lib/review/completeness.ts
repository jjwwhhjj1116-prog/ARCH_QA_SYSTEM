import type { Run } from './contracts';

// Old runs have no source census: never infer full coverage from their findings.
export function reviewCompleteness(run: Run) {
  const issues = [...(run.sourceAudit?.issues ?? [])];
  const audit = run.sourceAudit;
  if (!audit) issues.push('등록 파일·시트 전체 대조 기록 없음');
  else {
    if (
      !Number.isSafeInteger(audit.registeredFiles) ||
      audit.registeredFiles <= 0 ||
      audit.inspectedFiles !== audit.registeredFiles
    )
      issues.push('등록 파일 중 미확인 파일이 있습니다.');
    if (
      !Number.isSafeInteger(audit.totalSheets) ||
      audit.totalSheets <= 0 ||
      audit.mappedSheets !== audit.totalSheets
    )
      issues.push('등록 시트 중 매핑·처리 미확인 시트가 있습니다.');
  }
  const instructions = run.profile.instructions?.filter((i) => i.enabled) ?? [];
  const total = run.rows.length;
  if (!total) issues.push('검수 대상 행을 확인하지 못했습니다.');
  if (!instructions.length) issues.push('적용할 AI 검수 지침이 없습니다.');
  const rowIds = new Set(run.rows.map((row) => row.id));
  const ledger = new Map(
    instructions.map((i) => [i.id, new Map<string, boolean>()]),
  );
  if (rowIds.size !== total || ledger.size !== instructions.length)
    issues.push('검수 대상 행 또는 지침 식별자가 중복되었습니다.');
  if (!run.aiChecks) issues.push('행·지침별 AI 처리 기록 없음');
  for (const check of run.aiChecks ?? []) {
    const rows = ledger.get(check.instructionId);
    if (!rows || !rowIds.has(check.rowId)) {
      issues.push('AI 처리 기록에 대상 외 행·지침이 있습니다.');
      continue;
    }
    if (rows.has(check.rowId)) {
      issues.push('행·지침별 AI 처리 기록이 중복되었습니다.');
      rows.set(check.rowId, false);
    } else {
      rows.set(
        check.rowId,
        check.status === 'suspected' || check.status === 'not_flagged',
      );
    }
  }
  let evaluatedPairs = 0;
  for (const instruction of new Map(
    instructions.map((i) => [i.id, i]),
  ).values()) {
    const rows = ledger.get(instruction.id)!;
    const evaluated = [...rows.values()].filter(Boolean).length;
    evaluatedPairs += evaluated;
    if (rows.size !== total)
      issues.push(`지침 ${instruction.id}: 행별 처리 기록 누락`);
    if (evaluated !== total)
      issues.push(
        `지침 ${instruction.id}: ${total - evaluated}행 처리 완료 미확인`,
      );
    const records = run.coverage.filter(
      (c) => c.ruleId === `AI-${instruction.id}`,
    );
    const coverage = records[0];
    if (
      records.length !== 1 ||
      !coverage ||
      coverage.evaluated !== evaluated ||
      coverage.unevaluated !== total - evaluated
    ) {
      issues.push(`지침 ${instruction.id}: 전체 대상 대조 불가`);
      continue;
    }
    if (coverage.unevaluated > 0)
      issues.push(
        `지침 ${instruction.id}: ${coverage.unevaluated}행 미평가·제외 사유 확인 필요`,
      );
  }
  if (
    !run.ai ||
    run.ai.contextComplete !== true ||
    run.ai.state !== 'completed' ||
    run.ai.totalRows !== total ||
    run.ai.evaluatedRows !== total
  )
    issues.push('AI 전체 처리 완료가 확인되지 않았습니다.');
  const complete = issues.length === 0;
  return {
    complete,
    label: complete
      ? '전체 검수 완료 · 오류 없음 또는 승인 의미 아님'
      : '부분 검수 · 전체 완료 아님',
    evaluatedPairs,
    totalPairs: total * instructions.length,
    issues: [...new Set(issues)],
  };
}
