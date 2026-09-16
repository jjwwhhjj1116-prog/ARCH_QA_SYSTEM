import {
  inspectSourceFile,
  MAX_SOURCE_BYTES,
  SourceInspectionError,
} from '../lib/imports/inspect-source-file';
import {
  BASELINE_VERSION,
  baselineProfile,
  baselineSource,
  combineBaseline,
  type BaselinePart,
} from '../lib/review/baseline';
import { mappingSchema, type Mapping, type Run } from '../lib/review/contracts';
import { ReviewLimitError } from '../lib/review/engine';
import { exportReview } from '../lib/review/report';
import {
  readWorkbook,
  suggestMapping,
  WorkbookError,
} from '../lib/review/workbook';
import { z } from 'zod';

const provenanceSchema = z
  .object({
    projectId: z.uuid(),
    caseId: z.uuid(),
    packageId: z.uuid(),
    sourceVersionId: z.uuid(),
    sourceFileId: z.uuid(),
    uploadId: z.uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
type Input = {
  filename: string;
  bytes: Uint8Array<ArrayBuffer>;
  provenance?: z.infer<typeof provenanceSchema>;
};
export type MappingOverride = {
  filename: string;
  sha256: string;
  mapping: Mapping;
};

async function inspect(input: Input) {
  if (input.bytes.byteLength > MAX_SOURCE_BYTES)
    throw new SourceInspectionError(
      'FILE_TOO_LARGE',
      '파일당 원본 한도 20MiB를 넘었습니다.',
    );
  const bytes = new Uint8Array(input.bytes);
  const inspection = await inspectSourceFile({
    filename: input.filename,
    contentType: 'application/octet-stream',
    body: bytes,
  });
  if (
    input.provenance &&
    provenanceSchema.parse(input.provenance).sha256 !== inspection.sha256
  )
    throw new Error('등록 원본 해시가 다릅니다. 서버 자료를 다시 가져오세요.');
  return { inspection, sheets: readWorkbook(bytes, inspection.format) };
}

/** Bounded local preview; no source bytes leave this process. */
export async function inspectSources(inputs: Input[]) {
  if (!inputs.length || inputs.length > 32)
    throw new Error('산출서 1~32개를 선택해 주세요.');
  const files = [];
  const limitations: string[] = [];
  let previewCharacters = 0;
  const previewLimit = 1_000_000;
  for (const input of inputs) {
    try {
      const { inspection, sheets } = await inspect(input);
      const sourceVersionId =
        input.provenance?.sourceVersionId ?? crypto.randomUUID();
      files.push({
        filename: inspection.displayName,
        sha256: inspection.sha256,
        sizeBytes: inspection.sizeBytes,
        sheets: sheets.map((sheet) => ({
          name: sheet.name,
          mapping: suggestMapping(
            sheet,
            sourceVersionId,
            inspection.displayName,
          ),
          preview: sheet.rows.slice(0, 30).flatMap((row) => {
            if (previewCharacters >= previewLimit) return [];
            const cells = row.cells.slice(0, 64).map((cell) => {
              const text = cell.slice(
                0,
                Math.min(200, previewLimit - previewCharacters),
              );
              previewCharacters += text.length;
              return text;
            });
            return [{ row: row.number, cells }];
          }),
        })),
      });
      limitations.push(
        ...inspection.warnings.map(
          (warning) => `${inspection.displayName}: ${warning}`,
        ),
      );
    } catch (error) {
      if (
        !(
          error instanceof SourceInspectionError ||
          error instanceof WorkbookError
        )
      )
        throw error;
      limitations.push(`${input.filename}: 파일 미평가 — ${error.message}`);
    }
  }
  if (previewCharacters >= previewLimit)
    limitations.push(
      '미리보기 전체 표시 한도에 도달했습니다. 뒤쪽 원본은 파일을 나누어 선택해 확인하세요. 검수 원본은 잘라내지 않습니다.',
    );
  return { files, limitations };
}

/** Local, unsaved baseline only. This function neither authenticates nor uploads. */
export async function inspectAndReview(
  inputs: Input[],
  context?: { projectId: string; actorId: string; caseId?: string },
  overrides: MappingOverride[] = [],
): Promise<{
  run: Run;
  report: Uint8Array;
  files: { filename: string; sha256: string; sizeBytes: number }[];
}> {
  if (!inputs.length || inputs.length > 32)
    throw new Error('산출서 1~32개를 선택해 주세요.');
  const registered = inputs.filter((input) => input.provenance);
  for (const input of registered) {
    const ref = provenanceSchema.parse(input.provenance);
    if (ref.projectId !== context?.projectId || ref.caseId !== context?.caseId)
      throw new Error('등록 원본의 프로젝트·자료 기록이 현재 검수와 다릅니다.');
  }
  if (
    new Set(registered.map((input) => input.provenance!.sourceVersionId))
      .size !== registered.length
  )
    throw new Error('같은 등록 원본 버전을 중복 선택했습니다.');
  if (!Array.isArray(overrides) || overrides.length > 3200)
    throw new Error('수동 매핑 개수를 확인해 주세요.');
  const seen = new Set<string>();
  const pending = overrides.map((override) => {
    const parsed = mappingSchema.safeParse(override?.mapping);
    if (
      !parsed.success ||
      typeof override.filename !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(override.sha256)
    )
      throw new Error('수동 매핑 형식을 확인해 주세요.');
    const key = JSON.stringify([
      override.filename,
      override.sha256,
      parsed.data.sheet,
    ]);
    if (seen.has(key))
      throw new Error('같은 원본 시트에 중복 수동 매핑이 있습니다.');
    seen.add(key);
    return { ...override, mapping: parsed.data, used: false };
  });
  const parts: BaselinePart[] = [];
  const files: { filename: string; sha256: string; sizeBytes: number }[] = [];
  const limitations = [
    '실행 앱: CONCOST QC Desktop 0.1.4 내부 시험판.',
    '로컬 임시 실행입니다. 회원 인증·서버 저장·관리자 승인 이력이 아닙니다.',
    '표준 양식 자동 인식과 사용자가 지정한 수동 매핑을 적용했습니다. 미확인 시트는 미평가로 남깁니다.',
    '시공사별 매뉴얼·추가 지침·도면 대조는 수행하지 않았습니다.',
  ];
  for (const input of inputs) {
    try {
      const { inspection, sheets } = await inspect(input);
      const sourceVersionId =
        input.provenance?.sourceVersionId ?? crypto.randomUUID();
      const saved = pending
        .filter(
          (override) =>
            override.filename === inspection.displayName &&
            override.sha256 === inspection.sha256,
        )
        .map((override) => {
          const mapping = { ...override.mapping, sourceVersionId };
          const sheet = sheets.find((sheet) => sheet.name === mapping.sheet);
          const header = sheet?.rows.find(
            (row) => row.number === mapping.headerRow,
          );
          if (
            !header ||
            Object.values(mapping.columns).some(
              (column) => column !== null && column >= header.cells.length,
            )
          )
            throw new Error(
              '수동 매핑의 시트·머리글 행·열 범위를 다시 확인해 주세요.',
            );
          if (
            mapping.confirmed &&
            ((mapping.kind === 'detail' &&
              (mapping.columns.formula === null ||
                mapping.columns.item === null)) ||
              (mapping.kind === 'building-summary' &&
                (mapping.columns.item === null ||
                  mapping.columns.unit === null)))
          )
            throw new Error(
              '수동 매핑의 필수 열을 연결해 주세요. 상세: 품명·산식 / 동별집계: 품명·단위.',
            );
          override.used = true;
          return mapping;
        });
      const part = baselineSource(
        sheets,
        {
          filename: inspection.displayName,
          sourceVersionId,
          sha256: inspection.sha256,
        },
        saved,
      );
      parts.push(part);
      files.push({
        filename: inspection.displayName,
        sha256: inspection.sha256,
        sizeBytes: inspection.sizeBytes,
      });
      limitations.push(
        ...inspection.warnings.map(
          (warning) => `${inspection.displayName}: ${warning}`,
        ),
      );
      if (input.provenance)
        limitations.push(
          `등록 원본 연결: ${input.provenance.packageId} / ${input.provenance.uploadId}. PC에서 검사했으며 서버 검사 완료·승인 상태를 변경하지 않았습니다.`,
        );
    } catch (error) {
      if (
        !(
          error instanceof SourceInspectionError ||
          error instanceof WorkbookError ||
          error instanceof ReviewLimitError
        )
      )
        throw error;
      limitations.push(`${input.filename}: 파일 미평가 — ${error.message}`);
    }
  }
  if (pending.some((override) => !override.used))
    throw new Error(
      '수동 매핑 원본이 변경되었거나 찾을 수 없습니다. 파일을 다시 확인하고 매핑해 주세요.',
    );
  const combined = combineBaseline(parts);
  const run: Run = {
    ...combined,
    id: crypto.randomUUID(),
    projectId: context?.projectId ?? `local-${crypto.randomUUID()}`,
    caseId: context?.caseId ?? `local-${crypto.randomUUID()}`,
    actorId: context?.actorId ?? 'local-unverified',
    createdAt: new Date().toISOString(),
    profileId: BASELINE_VERSION,
    profileVersion: 1,
    trial: true,
    kind: 'baseline',
    engineVersion: BASELINE_VERSION,
    profile: structuredClone(baselineProfile),
    limitations: [...combined.limitations, ...limitations],
  };
  return { run, report: exportReview(run, []), files };
}
