import { z } from 'zod';

const opaqueId = z.uuid();
export const sourceFileLocatorSchema = z.object({
  projectId: opaqueId,
  caseId: opaqueId,
  sourceVersionId: opaqueId,
  fileId: opaqueId,
  extension: z.enum(['xlsx', 'xlsm', 'csv', 'pdf']),
});

export type SourceFileLocator = z.infer<typeof sourceFileLocatorSchema>;

export type StoredSourceFile = {
  body: ReadableStream | ArrayBuffer;
  contentType: string;
  sha256: string;
  size: number;
};

export type PutSourceFile = SourceFileLocator & {
  body: ArrayBuffer | ArrayBufferView;
  contentType: string;
  expectedSha256?: string;
  expectedSize?: number;
};

export type StoredSourceMetadata = { sha256: string; size: number };

export interface PrivateFileStorage {
  putSourceFile(input: PutSourceFile): Promise<StoredSourceMetadata>;
  getSourceFile(locator: SourceFileLocator): Promise<StoredSourceFile | null>;
}

export function sourceObjectKey(input: SourceFileLocator): string {
  const locator = sourceFileLocatorSchema.parse(input);
  return [
    'projects',
    locator.projectId,
    'cases',
    locator.caseId,
    'sources',
    locator.sourceVersionId,
    'files',
    `${locator.fileId}.${locator.extension}`,
  ].join('/');
}
