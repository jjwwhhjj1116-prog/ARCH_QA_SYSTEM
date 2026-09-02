import type { Actor } from '@/lib/domain/contracts';
import {
  SourceInspectionError,
  validateSourceDeclaration,
  type SourceDeclaration,
} from '@/lib/imports/inspect-source-file';
import { sourceObjectKey } from '@/lib/files/storage';
import {
  createSourcePackageSchema,
  idempotencyKeySchema,
  INGESTION_HARD_RULE_VERSION,
  type CreateSourcePackageInput,
  type SourcePackageSummary,
} from './contracts';
import type {
  NewSourceUploadIntentRecord,
  SourcePackageRepository,
} from './repository';

export class SourcePackageService {
  constructor(
    private readonly repository: SourcePackageRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(
    projectId: string,
    reviewCaseId: string,
    actor: Actor,
  ): Promise<SourcePackageSummary[]> {
    return this.repository.listForActor(projectId, reviewCaseId, actor.id);
  }

  async create(
    projectId: string,
    reviewCaseId: string,
    actor: Actor,
    input: CreateSourcePackageInput,
    idempotencyKey: string,
    requestId: string,
  ): Promise<SourcePackageSummary> {
    const parsed = createSourcePackageSchema.parse(input);
    const safeIdempotencyKey = idempotencyKeySchema.parse(idempotencyKey);
    const declarations = parsed.files.map((file) => ({
      declaration: validateSourceDeclaration(file),
      purpose: file.purpose,
    }));
    const normalizedNames = declarations.map(({ declaration }) =>
      declaration.displayName.toLocaleLowerCase(),
    );
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      throw new SourceInspectionError(
        'FILE_NAME_INVALID',
        '한 자료 묶음 안에서 같은 파일명을 두 번 사용할 수 없습니다.',
      );
    }
    const requestHash = await requestFingerprint(
      projectId,
      reviewCaseId,
      INGESTION_HARD_RULE_VERSION,
      parsed.displayName,
      declarations,
    );
    const packageId = crypto.randomUUID();
    const files = declarations.map(({ declaration, purpose }) =>
      createIntent(projectId, reviewCaseId, declaration, purpose),
    );
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1_000);

    return await this.repository.create({
      id: packageId,
      projectId,
      reviewCaseId,
      displayName: parsed.displayName,
      actor,
      requestId,
      idempotencyKey: safeIdempotencyKey,
      requestHash,
      hardRuleVersion: INGESTION_HARD_RULE_VERSION,
      files,
      createdAt,
      expiresAt,
    });
  }
}

function createIntent(
  projectId: string,
  reviewCaseId: string,
  declaration: SourceDeclaration,
  purpose: 'quantity_source' | 'reference' | 'attachment',
): NewSourceUploadIntentRecord {
  const sourceFileId = crypto.randomUUID();
  const sourceVersionId = crypto.randomUUID();
  const uploadId = crypto.randomUUID();
  const r2ObjectKey = sourceObjectKey({
    projectId,
    caseId: reviewCaseId,
    sourceVersionId,
    fileId: sourceFileId,
    extension: declaration.format,
  });
  return {
    uploadId,
    sourceFileId,
    sourceVersionId,
    filename: declaration.displayName,
    format: declaration.format,
    documentKind: declaration.documentKind,
    sizeBytes: declaration.sizeBytes,
    status: 'upload_pending',
    contentType: declaration.claimedContentType,
    purpose,
    r2ObjectKey,
  };
}

async function requestFingerprint(
  projectId: string,
  reviewCaseId: string,
  hardRuleVersion: string,
  displayName: string,
  files: Array<{
    declaration: SourceDeclaration;
    purpose: 'quantity_source' | 'reference' | 'attachment';
  }>,
): Promise<string> {
  const canonicalFiles = files
    .map(({ declaration, purpose }) => ({ ...declaration, purpose }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right), 'en'),
    );
  const payload = new TextEncoder().encode(
    JSON.stringify({
      projectId,
      reviewCaseId,
      hardRuleVersion,
      displayName,
      files: canonicalFiles,
    }),
  );
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}
