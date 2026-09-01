import { z } from 'zod';
import {
  type PrivateFileStorage,
  type PutSourceFile,
  type SourceFileLocator,
  type StoredSourceFile,
  type StoredSourceMetadata,
  sourceFileLocatorSchema,
  sourceObjectKey,
} from './storage';

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const contentTypeSchema = z.string().min(3).max(120);

export class PrivateR2FileStorage implements PrivateFileStorage {
  constructor(private readonly bucket: R2Bucket) {}

  async putSourceFile(input: PutSourceFile): Promise<StoredSourceMetadata> {
    const locator = sourceFileLocatorSchema.parse(input);
    const contentType = contentTypeSchema.parse(input.contentType);
    const snapshot = sourceSnapshot(input.body);
    const size = snapshot.byteLength;
    const sha256 = await sha256Hex(snapshot);
    if (
      input.expectedSize !== undefined &&
      (!Number.isSafeInteger(input.expectedSize) || input.expectedSize !== size)
    ) {
      throw new Error('요청 파일 크기와 실제 파일 크기가 일치하지 않습니다.');
    }
    if (
      input.expectedSha256 !== undefined &&
      sha256Schema.parse(input.expectedSha256.toLowerCase()) !== sha256
    ) {
      throw new Error('요청 파일 해시와 실제 파일 해시가 일치하지 않습니다.');
    }
    const stored = await this.bucket.put(sourceObjectKey(locator), snapshot, {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType },
      customMetadata: {
        projectId: locator.projectId,
        caseId: locator.caseId,
        sourceVersionId: locator.sourceVersionId,
        fileId: locator.fileId,
        sha256,
        size: String(size),
      },
    });
    if (!stored) {
      throw new Error('같은 계보의 원본 파일은 덮어쓸 수 없습니다.');
    }
    return { sha256, size };
  }

  async getSourceFile(
    input: SourceFileLocator,
  ): Promise<StoredSourceFile | null> {
    const locator = sourceFileLocatorSchema.parse(input);
    const object = await this.bucket.get(sourceObjectKey(locator));
    if (!object) return null;
    const metadata = object.customMetadata ?? {};
    const expectedScope = {
      projectId: locator.projectId,
      caseId: locator.caseId,
      sourceVersionId: locator.sourceVersionId,
      fileId: locator.fileId,
    };
    for (const [field, expected] of Object.entries(expectedScope)) {
      if (metadata[field] !== expected) {
        throw new Error('저장 파일의 프로젝트 계보가 일치하지 않습니다.');
      }
    }
    return {
      body: object.body,
      contentType:
        object.httpMetadata?.contentType ?? 'application/octet-stream',
      sha256: sha256Schema.parse(metadata.sha256),
      size: Number.parseInt(metadata.size ?? '', 10),
    };
  }
}

function sourceSnapshot(
  body: ArrayBuffer | ArrayBufferView,
): Uint8Array<ArrayBuffer> {
  if (body instanceof ArrayBuffer) return new Uint8Array(body.slice(0));
  const snapshot = new Uint8Array(body.byteLength);
  snapshot.set(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  return snapshot;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}
