import { describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/lib/domain/contracts';
import type { PrivateFileStorage } from '@/lib/files/storage';
import type {
  SourceUploadRepository,
  StoredUploadSummary,
  UploadContext,
} from './repository';
import { SourcePackageAccessError } from './repository';
import { SourceUploadService } from './upload-service';

const actor: Actor = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'reviewer@example.test',
  displayName: '검수자',
  source: 'development_mock',
};
const body = new TextEncoder().encode('품명,수량\n도장,12.5\n');
const context: UploadContext = {
  uploadId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  reviewCaseId: '44444444-4444-4444-8444-444444444444',
  packageId: '55555555-5555-4555-8555-555555555555',
  sourceFileId: '66666666-6666-4666-8666-666666666666',
  sourceVersionId: '77777777-7777-4777-8777-777777777777',
  filename: '내부산출서.csv',
  contentType: 'text/csv',
  format: 'csv',
  expectedSize: body.byteLength,
  claimVersion: 2,
  state: 'uploading',
  r2ObjectKey: 'private',
};

describe('SourceUploadService', () => {
  it('inspects and stores the same bounded snapshot before D1 completion', async () => {
    const repository = fakeRepository();
    const putSourceFile = vi.fn().mockImplementation(async (input) => ({
      sha256: await sha256(input.body),
      size: input.body.byteLength,
    }));
    const service = new SourceUploadService(repository, {
      putSourceFile,
    } as unknown as PrivateFileStorage);
    const result = await service.store(
      context.uploadId,
      actor,
      'request-1',
      async (limit) => {
        expect(limit).toBe(body.byteLength);
        return body;
      },
    );
    expect(result.status).toBe('stored');
    expect(putSourceFile).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: context.projectId,
        expectedSize: body.byteLength,
      }),
    );
    expect(repository.complete).toHaveBeenCalledOnce();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('rejects a declared-size mismatch before storage and records failure', async () => {
    const repository = fakeRepository();
    const putSourceFile = vi.fn();
    const service = new SourceUploadService(repository, {
      putSourceFile,
    } as unknown as PrivateFileStorage);
    await expect(
      service.store(context.uploadId, actor, 'request-1', async () =>
        body.subarray(0, body.byteLength - 1),
      ),
    ).rejects.toMatchObject({ code: 'FILE_SIZE_MISMATCH' });
    expect(putSourceFile).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(
      context,
      actor,
      'request-1',
      'FILE_SIZE_MISMATCH',
    );
  });

  it('does not read or store bytes when repository authorization rejects the actor', async () => {
    const repository = fakeRepository();
    repository.claim = vi
      .fn()
      .mockRejectedValue(new SourcePackageAccessError('접근 권한 없음'));
    const readBody = vi.fn();
    const putSourceFile = vi.fn();
    const service = new SourceUploadService(repository, {
      putSourceFile,
    } as unknown as PrivateFileStorage);

    await expect(
      service.store(context.uploadId, actor, 'request-idor', readBody),
    ).rejects.toBeInstanceOf(SourcePackageAccessError);
    expect(readBody).not.toHaveBeenCalled();
    expect(putSourceFile).not.toHaveBeenCalled();
    expect(repository.complete).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('records a recoverable failed attempt when R2 succeeds but D1 completion fails', async () => {
    const repository = fakeRepository();
    repository.complete.mockRejectedValueOnce(new Error('D1 unavailable'));
    const hash = await sha256(body);
    const service = new SourceUploadService(repository, {
      putSourceFile: vi.fn().mockResolvedValue({
        sha256: hash,
        size: body.byteLength,
      }),
    } as unknown as PrivateFileStorage);

    await expect(
      service.store(
        context.uploadId,
        actor,
        'request-d1-fail',
        async () => body,
      ),
    ).rejects.toThrow('D1 unavailable');
    expect(repository.fail).toHaveBeenCalledWith(
      context,
      actor,
      'request-d1-fail',
      'UPLOAD_FAILED',
    );
  });

  it('surfaces a recovery error when the failed state cannot be persisted', async () => {
    const repository = fakeRepository();
    repository.complete.mockRejectedValueOnce(new Error('D1 unavailable'));
    repository.fail.mockRejectedValueOnce(new Error('D1 unavailable'));
    const hash = await sha256(body);
    const service = new SourceUploadService(repository, {
      putSourceFile: vi.fn().mockResolvedValue({
        sha256: hash,
        size: body.byteLength,
      }),
    } as unknown as PrivateFileStorage);

    await expect(
      service.store(context.uploadId, actor, 'request-stuck', async () => body),
    ).rejects.toThrow('실패 상태를 기록하지 못했습니다');
  });
});

function fakeRepository(): SourceUploadRepository & {
  complete: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
} {
  const summary: StoredUploadSummary = {
    uploadId: context.uploadId,
    packageId: context.packageId,
    sourceVersionId: context.sourceVersionId,
    filename: context.filename,
    status: 'stored',
    packageStatus: 'stored_unverified',
    projectIdentityStatus: 'pending',
    sha256: 'a'.repeat(64),
    sizeBytes: body.byteLength,
    warnings: [],
  };
  return {
    claim: vi.fn().mockResolvedValue(context),
    complete: vi.fn().mockResolvedValue(summary),
    fail: vi.fn().mockResolvedValue(undefined),
  };
}

async function sha256(value: Uint8Array): Promise<string> {
  const snapshot = Uint8Array.from(value);
  const digest = await crypto.subtle.digest('SHA-256', snapshot);
  return [...new Uint8Array(digest)]
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
}
