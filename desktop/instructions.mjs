import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  defaultProfile,
  profileSchema,
  aiInstructionSchema,
  mappingSchema,
} from '../lib/review/contracts';
import { rolesForAction } from '../lib/domain/permissions';

const inputSchema = z.discriminatedUnion('action', [
  ...['trial', 'approve', 'trial-detail'].map((action) =>
    z
      .object({
        action: z.literal(action),
        projectId: z.uuid(),
        caseId: z.uuid(),
        profileId: z.uuid(),
        ...(action !== 'trial-detail'
          ? { expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) }
          : {}),
        ...(action !== 'trial' ? { trialRunId: z.uuid() } : {}),
      })
      .strict(),
  ),
  z
    .object({
      action: z.literal('list'),
      projectId: z.uuid(),
      caseId: z.uuid().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('save'),
      projectId: z.uuid(),
      caseId: z.uuid(),
      baseProfileId: z.uuid().nullable(),
      expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
      name: z.string().trim().min(1).max(100),
      reason: z.string().trim().min(1).max(500),
      instructions: z.array(aiInstructionSchema).max(10),
    })
    .strict(),
]);
const versionSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  status: z.enum(['draft', 'active']),
  profile: profileSchema,
  createdAt: z.string(),
  trialRunId: z.uuid().nullable(),
});

function trialSummary(raw, input, selectedProfile) {
  const run = z
    .object({
      id: z.uuid(),
      projectId: z.uuid(),
      caseId: z.uuid(),
      profileId: z.uuid(),
      profileVersion: z.number().int().positive(),
      trial: z.literal(true),
      createdAt: z.string().max(100),
      profile: profileSchema,
      rows: z.array(z.unknown()).max(20000),
      findings: z.array(z.unknown()),
      coverage: z
        .array(
          z.object({
            ruleId: z.string().max(100),
            label: z.string().max(1000),
            evaluated: z.number().int().nonnegative(),
            unevaluated: z.number().int().nonnegative(),
            reasons: z.array(z.string().max(2000)).max(100),
          }),
        )
        .max(100),
      limitations: z.array(z.string()).max(10000),
    })
    .parse(raw);
  if (
    run.projectId !== input.projectId ||
    run.caseId !== input.caseId ||
    run.profileId !== input.profileId ||
    (input.trialRunId && run.id !== input.trialRunId) ||
    run.profileVersion !== selectedProfile.version ||
    JSON.stringify(run.profile) !== JSON.stringify(selectedProfile.profile)
  )
    throw new Error('선택한 케이스·지침 버전의 시험 결과가 아닙니다.');
  const approvalBlockers = [];
  if (!run.coverage.some((item) => item.evaluated > 0))
    approvalBlockers.push(
      '실제로 평가한 항목이 없는 시험은 활성화할 수 없습니다.',
    );
  if (
    run.profile.instructions?.some(
      (instruction) =>
        instruction.enabled &&
        !run.coverage.some(
          (item) =>
            item.ruleId === `AI-${instruction.id}` && item.evaluated > 0,
        ),
    )
  )
    approvalBlockers.push(
      '활성 AI 지침마다 AI 시험 평가가 필요합니다. 이번 데스크톱 시험은 외부 AI를 호출하지 않습니다.',
    );
  return {
    id: run.id,
    profileId: run.profileId,
    profileVersion: run.profileVersion,
    createdAt: run.createdAt,
    rowCount: run.rows.length,
    findingCount: run.findings.length,
    coverage: run.coverage,
    limitations: run.limitations
      .slice(0, 50)
      .map((text) => text.slice(0, 1000)),
    canApprove: approvalBlockers.length === 0,
    approvalBlockers,
  };
}

// Server remains authoritative. Only fixed, authenticated review routes are exposed.
export async function instructionAction(api, rawInput) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success)
    throw new Error('지침 입력과 프로젝트·케이스를 확인해 주세요.');
  const input = parsed.data;
  const projects = await api('/api/projects');
  const project = projects.find(
    (item) => item.id === input.projectId && item.status === 'active',
  );
  if (!project) throw new Error('이 프로젝트에 접근할 권한이 없습니다.');
  const path = `/api/projects/${input.projectId}`;
  const cases = z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        discipline: z.enum(['FIN', 'RC']),
        status: z.string(),
      }),
    )
    .parse(await api(`${path}/cases`))
    .filter((item) => item.discipline === 'FIN' && item.status !== 'archived');
  const selected = input.caseId
    ? cases.find((item) => item.id === input.caseId)
    : cases[0];
  if (input.caseId && !selected)
    throw new Error('사용 가능한 마감 검수 케이스를 선택해 주세요.');
  if (!selected)
    return {
      cases,
      caseId: null,
      profiles: [],
      expectedRevision: '',
      canManageGuidelines: false,
      defaultProfile,
    };
  const state = await api(`${path}/review?caseId=${selected.id}`);
  const profiles = z.array(versionSchema).max(50).parse(state.profiles);
  const expectedRevision = createHash('sha256')
    .update(JSON.stringify(profiles))
    .digest('hex');
  const canManageGuidelines =
    state.canManageGuidelines === true &&
    rolesForAction('review:run').includes(project.role);
  if (input.action === 'list')
    return {
      cases,
      caseId: selected.id,
      profiles,
      expectedRevision,
      canManageGuidelines,
      defaultProfile,
      sourcesCount: Array.isArray(state.sources) ? state.sources.length : 0,
      confirmedMappingCount: Array.isArray(state.mappings)
        ? state.mappings.filter(
            (item) =>
              item.confirmed &&
              state.sources?.some(
                (source) => source.sourceVersionId === item.sourceVersionId,
              ),
          ).length
        : 0,
      runs: z
        .array(
          z.object({
            id: z.uuid(),
            createdAt: z.string().max(100),
            profileVersion: z.number().int().positive(),
            trial: z.boolean(),
            findingCount: z.number().int().nonnegative(),
            rowCount: z.number().int().nonnegative(),
          }),
        )
        .max(60)
        .parse(state.runs ?? []),
    };
  if (!canManageGuidelines)
    throw new Error('지침 초안 저장은 검수 권한이 있는 관리자만 가능합니다.');
  if (
    input.action !== 'trial-detail' &&
    input.expectedRevision !== expectedRevision
  )
    throw new Error(
      '서버 지침 버전이 변경되었습니다. 작성 내용을 보관하고 목록을 새로 확인해 주세요.',
    );
  if (input.action !== 'save') {
    const selectedProfile = profiles.find(
      (item) => item.id === input.profileId,
    );
    if (!selectedProfile) throw new Error('기준 지침 버전을 찾을 수 없습니다.');
    if (input.action === 'trial') {
      const sources = z
        .array(z.object({ sourceVersionId: z.uuid() }))
        .parse(state.sources);
      const mappings = z.array(mappingSchema).parse(state.mappings);
      if (
        !sources.length ||
        !mappings.some(
          (mapping) =>
            mapping.confirmed &&
            sources.some(
              (source) => source.sourceVersionId === mapping.sourceVersionId,
            ),
        )
      )
        throw new Error(
          '서버에 자료를 등록하고 시트·열 매핑을 먼저 확인해 주세요.',
        );
      // A lost response must be resolved through server history, never automatic retry.
      const response = await api(`${path}/review`, 'POST', {
        action: 'run',
        caseId: selected.id,
        profileId: input.profileId,
        trial: true,
        includeAi: false,
      });
      return trialSummary(response.run, input, selectedProfile);
    }
    const response = await api(
      `${path}/review?caseId=${selected.id}&runId=${input.trialRunId}`,
    );
    const summary = trialSummary(response.run, input, selectedProfile);
    if (input.action === 'trial-detail') return summary;
    if (!summary.canApprove)
      throw new Error(summary.approvalBlockers.join(' '));
    const approved = await api(`${path}/review`, 'POST', {
      action: 'approve',
      caseId: selected.id,
      profileId: input.profileId,
      trialRunId: input.trialRunId,
    });
    return z.object({ id: z.literal(input.profileId) }).parse(approved);
  }
  const base = input.baseProfileId
    ? profiles.find((item) => item.id === input.baseProfileId)?.profile
    : defaultProfile;
  if (!base)
    throw new Error(
      '기준 지침 버전을 찾을 수 없습니다. 목록을 새로 확인해 주세요.',
    );
  const profile = profileSchema.safeParse({
    ...base,
    name: input.name,
    reason: input.reason,
    instructions: input.instructions,
  });
  if (!profile.success)
    throw new Error('지침 내용과 중복된 지침 ID를 확인해 주세요.');
  const request = {
    action: 'profile',
    caseId: selected.id,
    profile: profile.data,
  };
  if (Buffer.byteLength(JSON.stringify(request), 'utf8') > 32 * 1024)
    throw new Error('지침 전체 크기가 32KB를 초과합니다. 내용을 줄여 주세요.');
  // Concurrent saves can both append versions; this is not an atomic server conflict lock.
  // Existing versions are never overwritten and no trial, approval or AI call occurs here.
  return await api(`${path}/review`, 'POST', request);
}
