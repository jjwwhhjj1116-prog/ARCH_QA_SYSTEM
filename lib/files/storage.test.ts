import { describe, expect, it, vi } from 'vitest';
import { PrivateR2FileStorage } from './r2-storage';
import { sourceObjectKey } from './storage';

const locator = {
  projectId: '11111111-1111-4111-8111-111111111111',
  caseId: '22222222-2222-4222-8222-222222222222',
  sourceVersionId: '33333333-3333-4333-8333-333333333333',
  fileId: '44444444-4444-4444-8444-444444444444',
  extension: 'xlsx' as const,
};

describe('private file storage', () => {
  it('builds an exact opaque key without the user filename', () => {
    expect(sourceObjectKey(locator)).toBe(
      'projects/11111111-1111-4111-8111-111111111111/cases/22222222-2222-4222-8222-222222222222/sources/33333333-3333-4333-8333-333333333333/files/44444444-4444-4444-8444-444444444444.xlsx',
    );
  });

  it('writes immutable scope and checksum metadata', async () => {
    const put = vi.fn().mockResolvedValue({ key: sourceObjectKey(locator) });
    const storage = new PrivateR2FileStorage({ put } as unknown as R2Bucket);
    const metadata = await storage.putSourceFile({
      ...locator,
      body: new Uint8Array([1, 2, 3]),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(metadata).toEqual({
      sha256:
        '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      size: 3,
    });
    expect(put).toHaveBeenCalledWith(
      sourceObjectKey(locator),
      expect.any(Uint8Array),
      expect.objectContaining({
        customMetadata: expect.objectContaining({
          projectId: locator.projectId,
          sha256: metadata.sha256,
        }),
        onlyIf: { etagDoesNotMatch: '*' },
      }),
    );
  });

  it('fails closed when an immutable source key already exists', async () => {
    const put = vi.fn().mockResolvedValue(null);
    const storage = new PrivateR2FileStorage({ put } as unknown as R2Bucket);
    await expect(
      storage.putSourceFile({
        ...locator,
        body: new Uint8Array([1]),
        contentType: 'application/octet-stream',
      }),
    ).rejects.toThrow('덮어쓸 수 없습니다');
  });

  it('rejects checksum and size claims that differ from the input snapshot', async () => {
    const put = vi.fn();
    const storage = new PrivateR2FileStorage({ put } as unknown as R2Bucket);
    await expect(
      storage.putSourceFile({
        ...locator,
        body: new Uint8Array([1, 2, 3]),
        contentType: 'application/octet-stream',
        expectedSha256: 'a'.repeat(64),
      }),
    ).rejects.toThrow('실제 파일 해시');
    await expect(
      storage.putSourceFile({
        ...locator,
        body: new Uint8Array([1, 2, 3]),
        contentType: 'application/octet-stream',
        expectedSize: 99,
      }),
    ).rejects.toThrow('실제 파일 크기');
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects a stored object whose lineage metadata was relabelled', async () => {
    const get = vi.fn().mockResolvedValue({
      body: new ArrayBuffer(0),
      customMetadata: {
        ...locator,
        projectId: '99999999-9999-4999-8999-999999999999',
        sha256: 'b'.repeat(64),
        size: '0',
      },
      httpMetadata: { contentType: 'application/octet-stream' },
    });
    const storage = new PrivateR2FileStorage({ get } as unknown as R2Bucket);
    await expect(storage.getSourceFile(locator)).rejects.toThrow(
      '프로젝트 계보',
    );
  });
});
