import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourcePackageAccessError } from '@/lib/ingestion/repository';

const store = vi.fn();
vi.mock('@/lib/ingestion/upload-service', () => ({
  SourceUploadService: class {
    store = store;
  },
}));
vi.mock('@/lib/files/r2-factory', () => ({
  FileStorageUnavailableError: class FileStorageUnavailableError extends Error {
    readonly code = 'FILE_STORAGE_UNAVAILABLE';
  },
  getPrivateFileStorage: vi.fn(() => ({})),
}));
vi.mock('@/lib/ingestion/d1-repository', () => ({
  D1SourcePackageRepository: class {},
}));

const { PUT } = await import('./route');
const uploadId = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ uploadId }) };

describe('source upload byte API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LOCAL_DEMO_MODE = 'true';
    store.mockImplementation(async (_id, _actor, _requestId, readBody) => {
      const bytes = await readBody(3);
      return {
        uploadId,
        packageId: '22222222-2222-4222-8222-222222222222',
        sourceVersionId: '33333333-3333-4333-8333-333333333333',
        filename: '내부산출서.csv',
        status: 'stored',
        packageStatus: 'stored_unverified',
        projectIdentityStatus: 'pending',
        sha256: 'a'.repeat(64),
        sizeBytes: bytes.byteLength,
        warnings: [],
      };
    });
  });

  it('stores a bounded binary body without exposing the R2 key', async () => {
    const response = await PUT(
      binaryRequest(new Uint8Array([1, 2, 3])),
      context,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ status: 'stored', sizeBytes: 3 });
    expect(JSON.stringify(body)).not.toContain('r2');
  });

  it('rejects cross-site, malformed ID, wrong media type and overflow', async () => {
    const crossSite = await PUT(
      binaryRequest(new Uint8Array([1]), { 'sec-fetch-site': 'cross-site' }),
      context,
    );
    expect(crossSite.status).toBe(403);
    const malformed = await PUT(binaryRequest(new Uint8Array([1])), {
      params: Promise.resolve({ uploadId: 'not-an-id' }),
    });
    expect(malformed.status).toBe(400);
    const wrongType = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: { 'content-type': 'text/plain' },
        body: 'abc',
      }),
      context,
    );
    expect(wrongType.status).toBe(415);
    const overflow = await PUT(
      binaryRequest(new Uint8Array([1, 2, 3, 4])),
      context,
    );
    expect(overflow.status).toBe(413);
  });

  it('maps repository authorization denial to a safe 403 envelope', async () => {
    store.mockRejectedValueOnce(
      new SourcePackageAccessError('이 파일 업로드에 접근할 권한이 없습니다.'),
    );
    const response = await PUT(
      binaryRequest(new Uint8Array([1, 2, 3])),
      context,
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error).toMatchObject({
      code: 'SOURCE_PACKAGE_ACCESS_DENIED',
      message: '이 파일 업로드에 접근할 권한이 없습니다.',
    });
    expect(JSON.stringify(body)).not.toContain('r2ObjectKey');
  });
});

function binaryRequest(
  bytes: Uint8Array<ArrayBuffer>,
  headers: Record<string, string> = {},
): Request {
  return new Request('http://localhost', {
    method: 'PUT',
    headers: {
      'content-type': 'application/octet-stream',
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
    body: bytes,
  });
}
