import type { Actor } from '@/lib/domain/contracts';
import type { SourceInspection } from '@/lib/imports/inspect-source-file';
import type {
  SourcePackageSummary,
  SourceUploadIntentSummary,
} from './contracts';

export type NewSourceUploadIntentRecord = SourceUploadIntentSummary & {
  contentType: string;
  purpose: 'quantity_source' | 'reference' | 'attachment';
  r2ObjectKey: string;
};

export type NewSourcePackageRecord = {
  id: string;
  projectId: string;
  reviewCaseId: string;
  displayName: string;
  actor: Actor;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
  hardRuleVersion: string;
  files: NewSourceUploadIntentRecord[];
  createdAt: Date;
  expiresAt: Date;
};

export type ArchiveSourcePackageRecord = {
  projectId: string;
  reviewCaseId: string;
  packageId: string;
  expectedVersion: number;
  actor: Actor;
  requestId: string;
  archivedAt: Date;
};

export type ArchivedSourcePackageSummary = {
  id: string;
  status: 'aborted';
  deletionMode: 'soft_abort';
  retainedForAudit: true;
};

export interface SourcePackageRepository {
  listForActor(
    projectId: string,
    reviewCaseId: string,
    actorId: string,
  ): Promise<SourcePackageSummary[]>;
  create(record: NewSourcePackageRecord): Promise<SourcePackageSummary>;
  archive(
    record: ArchiveSourcePackageRecord,
  ): Promise<ArchivedSourcePackageSummary>;
}

export type UploadContext = {
  uploadId: string;
  projectId: string;
  reviewCaseId: string;
  packageId: string;
  sourceFileId: string;
  sourceVersionId: string;
  filename: string;
  contentType: string;
  format: 'xlsx' | 'csv';
  expectedSize: number;
  claimVersion: number;
  state:
    | 'created'
    | 'uploading'
    | 'uploaded'
    | 'finalizing'
    | 'finalized'
    | 'failed'
    | 'expired';
  r2ObjectKey: string;
};

export type StoredUploadSummary = {
  uploadId: string;
  packageId: string;
  sourceVersionId: string;
  filename: string;
  status: 'stored';
  packageStatus: SourcePackageSummary['status'];
  projectIdentityStatus: SourcePackageSummary['projectIdentityStatus'];
  sha256: string;
  sizeBytes: number;
  warnings: string[];
};

export interface SourceUploadRepository {
  claim(
    uploadId: string,
    actor: Actor,
    requestId: string,
  ): Promise<UploadContext>;
  complete(
    context: UploadContext,
    actor: Actor,
    requestId: string,
    inspection: SourceInspection,
  ): Promise<StoredUploadSummary>;
  fail(
    context: UploadContext,
    actor: Actor,
    requestId: string,
    errorCode: string,
  ): Promise<void>;
}

export class SourcePackageAccessError extends Error {
  readonly code = 'SOURCE_PACKAGE_ACCESS_DENIED';
}

export class SourcePackageConflictError extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT';
}

export class SourceUploadStateError extends Error {
  readonly code = 'SOURCE_UPLOAD_STATE_CONFLICT';
}
