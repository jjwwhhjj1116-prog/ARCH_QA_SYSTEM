import type { Actor } from '@/lib/domain/contracts';
import type { PrivateFileStorage } from '@/lib/files/storage';
import {
  inspectSourceFile,
  SourceInspectionError,
} from '@/lib/imports/inspect-source-file';
import type { SourceUploadRepository, StoredUploadSummary } from './repository';

export class SourceUploadService {
  constructor(
    private readonly repository: SourceUploadRepository,
    private readonly storage: PrivateFileStorage,
  ) {}

  async store(
    uploadId: string,
    actor: Actor,
    requestId: string,
    readBody: (maxBytes: number) => Promise<Uint8Array<ArrayBuffer>>,
  ): Promise<StoredUploadSummary> {
    const context = await this.repository.claim(uploadId, actor, requestId);
    try {
      const bytes = await readBody(context.expectedSize);
      if (bytes.byteLength !== context.expectedSize) {
        throw new SourceInspectionError(
          'FILE_SIZE_MISMATCH',
          '선언한 파일 크기와 실제 파일 크기가 일치하지 않습니다.',
        );
      }
      const inspection = await inspectSourceFile({
        filename: context.filename,
        contentType: context.contentType,
        body: bytes,
      });
      const stored = await this.storage.putSourceFile({
        projectId: context.projectId,
        caseId: context.reviewCaseId,
        sourceVersionId: context.sourceVersionId,
        fileId: context.sourceFileId,
        extension: context.format,
        body: bytes,
        contentType: inspection.detectedContentType,
        expectedSize: inspection.sizeBytes,
        expectedSha256: inspection.sha256,
      });
      if (
        stored.sha256 !== inspection.sha256 ||
        stored.size !== inspection.sizeBytes
      ) {
        throw new SourceInspectionError(
          'FILE_SIGNATURE_MISMATCH',
          '검사한 파일과 저장된 파일의 무결성 정보가 일치하지 않습니다.',
        );
      }
      return await this.repository.complete(
        context,
        actor,
        requestId,
        inspection,
      );
    } catch (error) {
      if (context.state === 'uploading') {
        try {
          await this.repository.fail(
            context,
            actor,
            requestId,
            errorCode(error),
          );
        } catch {
          throw new Error(
            '업로드 실패 상태를 기록하지 못했습니다. 잠시 후 다시 시도해 주세요.',
            { cause: error },
          );
        }
      }
      throw error;
    }
  }
}

function errorCode(error: unknown): string {
  if (
    error instanceof SourceInspectionError ||
    (error instanceof Error && 'code' in error)
  ) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.length <= 80) return code;
  }
  return 'UPLOAD_FAILED';
}
