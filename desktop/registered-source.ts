import { z } from 'zod';
import { downloadOriginal } from '../lib/http/download-original';

const selectionSchema = z
  .object({
    projectId: z.uuid(),
    caseId: z.uuid(),
    packageId: z.uuid(),
    sourceVersionId: z.uuid(),
  })
  .strict();
const packageSchema = z.object({
  id: z.uuid(),
  displayName: z.string().max(120).optional(),
  projectId: z.uuid(),
  reviewCaseId: z.uuid(),
  version: z.number().int().positive(),
  status: z.string(),
  supersededBy: z.string().nullable().optional(),
  files: z
    .array(
      z.object({
        uploadId: z.uuid(),
        sourceFileId: z.uuid(),
        sourceVersionId: z.uuid(),
        filename: z.string().min(1).max(180),
        format: z.enum(['xlsx', 'csv']),
        sizeBytes: z
          .number()
          .int()
          .positive()
          .max(20 * 1048576),
        status: z.string(),
        uploadState: z.string().optional(),
      }),
    )
    .max(32),
});

export async function listRegisteredSources(
  api: (path: string) => Promise<unknown>,
  raw: unknown,
) {
  const input = selectionSchema
    .pick({ projectId: true, caseId: true })
    .partial({ caseId: true })
    .parse(raw);
  const path = `/api/projects/${input.projectId}/cases`;
  const cases = z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().max(200),
        status: z.string(),
        discipline: z.enum(['FIN', 'RC']),
      }),
    )
    .max(1000)
    .parse(await api(path))
    .filter((item) => item.status !== 'archived' && item.discipline === 'FIN');
  const selected = input.caseId
    ? cases.find((item) => item.id === input.caseId)
    : cases[0];
  if (input.caseId && !selected)
    throw new Error('선택한 자료 기록을 다시 확인해 주세요.');
  if (!selected) return { cases, caseId: null, files: [] };
  const packages = z
    .array(packageSchema)
    .max(10000)
    .parse(await api(`${path}/${selected.id}/source-packages`));
  const files = packages
    .filter(
      (pkg) =>
        pkg.projectId === input.projectId &&
        pkg.reviewCaseId === selected.id &&
        !pkg.supersededBy &&
        !['blocked', 'rejected', 'aborted'].includes(pkg.status),
    )
    .flatMap((pkg) =>
      pkg.files
        .filter(
          (file) =>
            file.status === 'uploaded' &&
            file.uploadState === 'uploaded' &&
            file.filename.toLowerCase().endsWith(`.${file.format}`),
        )
        .map((file) => ({
          packageId: pkg.id,
          sourceVersionId: file.sourceVersionId,
          filename: file.filename,
          sizeBytes: file.sizeBytes,
          packageName: pkg.displayName ?? '등록 자료',
        })),
    );
  return {
    cases: cases.map(({ id, name }) => ({ id, name })),
    caseId: selected.id,
    files,
  };
}

/** Read-only bridge. Pending Drive bytes are inspected on the PC, never promoted here.
 * api/fetcher must be supplied by the authenticated main process, not the renderer.
 * assertCurrent must reject account/project changes, including between ranges.
 */
export async function loadRegisteredSource(
  api: (path: string) => Promise<unknown>,
  fetcher: typeof fetch,
  selection: unknown,
  assertCurrent: () => Promise<void>,
  progress: (bytes: number) => void = () => {},
) {
  const input = selectionSchema.parse(selection);
  const path = `/api/projects/${input.projectId}/cases/${input.caseId}/source-packages`;
  async function currentSource() {
    await assertCurrent();
    const raw = await api(path);
    if (!Array.isArray(raw) || raw.length > 10000)
      throw new Error('서버 자료 목록을 확인할 수 없습니다.');
    const matches = raw.filter((item) => item?.id === input.packageId);
    if (matches.length !== 1)
      throw new Error('선택한 자료 묶음을 다시 확인해 주세요.');
    const pkg = packageSchema.parse(matches[0]);
    if (
      pkg.projectId !== input.projectId ||
      pkg.reviewCaseId !== input.caseId ||
      pkg.supersededBy ||
      ['blocked', 'rejected', 'aborted'].includes(pkg.status)
    )
      throw new Error('다른 프로젝트이거나 제외·교체된 자료입니다.');
    const sources = pkg.files.filter(
      (file) => file.sourceVersionId === input.sourceVersionId,
    );
    if (sources.length !== 1)
      throw new Error('선택한 원본 버전을 다시 확인해 주세요.');
    const source = sources[0]!;
    // This endpoint is specifically for the resumable Drive path, not legacy R2.
    if (
      source.status !== 'uploaded' ||
      source.uploadState !== 'uploaded' ||
      !source.filename.toLowerCase().endsWith(`.${source.format}`)
    )
      throw new Error('Drive 업로드가 확인된 검사 대기 원본만 지원합니다.');
    return { packageVersion: pkg.version, ...source };
  }
  const before = await currentSource();
  const boundedFetch: typeof fetch = async (url, init) => {
    await assertCurrent();
    return fetcher(url, { ...init, redirect: 'error' });
  };
  const blob = await downloadOriginal(
    before.uploadId,
    before.sizeBytes,
    progress,
    boundedFetch,
  );
  const after = await currentSource();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error(
      '전송 중 자료 버전이 변경되었습니다. 목록을 다시 확인해 주세요.',
    );
  await assertCurrent();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  await assertCurrent();
  return {
    filename: before.filename,
    bytes,
    provenance: {
      ...input,
      sourceFileId: before.sourceFileId,
      uploadId: before.uploadId,
      sha256,
    },
    serverInspection: 'pending' as const,
  };
}
