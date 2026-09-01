import { z } from 'zod';
import { MAX_SOURCE_BYTES } from '@/lib/imports/inspect-source-file';

export const INGESTION_HARD_RULE_VERSION = '2026.09.01';

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/u);

export const createSourcePackageSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  files: z
    .array(
      z.object({
        filename: z.string().trim().min(1).max(180),
        contentType: z.string().trim().min(3).max(120),
        sizeBytes: z.number().int().min(1).max(MAX_SOURCE_BYTES),
        purpose: z
          .enum(['quantity_source', 'reference', 'attachment'])
          .default('quantity_source'),
      }),
    )
    .min(1)
    .max(32),
});

export type CreateSourcePackageInput = z.infer<
  typeof createSourcePackageSchema
>;

export type SourceUploadIntentSummary = {
  uploadId: string;
  sourceFileId: string;
  sourceVersionId: string;
  filename: string;
  format: 'xlsx' | 'csv';
  documentKind: 'takeoff' | 'summary' | 'unknown';
  sizeBytes: number;
  status:
    | 'upload_pending'
    | 'uploaded'
    | 'validating'
    | 'stored'
    | 'rejected'
    | 'deleted';
};

export type SourcePackageSummary = {
  id: string;
  projectId: string;
  reviewCaseId: string;
  displayName: string;
  status:
    | 'draft'
    | 'receiving'
    | 'validating'
    | 'stored_unverified'
    | 'identity_matched'
    | 'blocked'
    | 'rejected'
    | 'aborted';
  projectIdentityStatus: 'pending' | 'matched' | 'unknown' | 'conflict';
  files: SourceUploadIntentSummary[];
  createdAt: string;
};
