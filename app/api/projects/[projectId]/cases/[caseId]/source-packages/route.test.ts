import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourcePackageAccessError } from '@/lib/ingestion/repository';

const create = vi.fn().mockImplementation((record) =>
  Promise.resolve({
    id: record.id,
    projectId: record.projectId,
    reviewCaseId: record.reviewCaseId,
    displayName: record.displayName,
    status: 'receiving',
    projectIdentityStatus: 'pending',
    files: record.files.map((file: Record<string, unknown>) => ({
      uploadId: file.uploadId,
      sourceFileId: file.sourceFileId,
      sourceVersionId: file.sourceVersionId,
      filename: file.filename,
      format: file.format,
      documentKind: file.documentKind,
      sizeBytes: file.sizeBytes,
      status: file.status,
    })),
    createdAt: record.createdAt.toISOString(),
  }),
);
const listForActor = vi.fn();

vi.mock('@/lib/files/r2-factory', () => ({
  FileStorageUnavailableError: class FileStorageUnavailableError extends Error {
    readonly code = 'FILE_STORAGE_UNAVAILABLE';
  },
  getPrivateFileStorage: vi.fn(() => ({})),
}));

vi.mock('@/lib/ingestion/d1-repository', () => ({
  D1SourcePackageRepository: class {
    create = create;
    listForActor = listForActor;
  },
}));

const { GET, POST } = await import('./route');
const projectId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ projectId, caseId }) };

describe('source package API boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LOCAL_DEMO_MODE = 'true';
    listForActor.mockResolvedValue([]);
  });

  it('lists the persisted packages for the exact project and case scope', async () => {
    listForActor.mockResolvedValueOnce([
      {
        id: '33333333-3333-4333-8333-333333333333',
        projectId,
        reviewCaseId: caseId,
        displayName: '1차 검수 자료',
        status: 'stored_unverified',
        projectIdentityStatus: 'pending',
        files: [
          {
            uploadId: '44444444-4444-4444-8444-444444444444',
            sourceFileId: '55555555-5555-4555-8555-555555555555',
            sourceVersionId: '66666666-6666-4666-8666-666666666666',
            filename: '내부산출서.csv',
            format: 'csv',
            documentKind: 'takeoff',
            sizeBytes: 12,
            status: 'stored',
          },
        ],
        createdAt: '2026-09-02T00:00:00.000Z',
      },
    ]);

    const response = await GET(
      new Request(
        `http://localhost/api/projects/${projectId}/cases/${caseId}/source-packages`,
      ),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          projectId,
          reviewCaseId: caseId,
          status: 'stored_unverified',
          files: [{ filename: '내부산출서.csv', status: 'stored' }],
        },
      ],
    });
    expect(listForActor).toHaveBeenCalledWith(
      projectId,
      caseId,
      'local-user-owner',
    );
  });

  it('keeps package-list authorization failures fail-closed', async () => {
    listForActor.mockRejectedValueOnce(
      new SourcePackageAccessError(
        '이 프로젝트의 산출서와 집계표를 볼 권한이 없습니다.',
      ),
    );

    const response = await GET(
      new Request(
        `http://localhost/api/projects/${projectId}/cases/${caseId}/source-packages`,
      ),
      context,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'SOURCE_PACKAGE_ACCESS_DENIED',
        message: '이 프로젝트의 산출서와 집계표를 볼 권한이 없습니다.',
      },
    });
  });

  it('creates opaque intents without exposing an R2 object key', async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      data: {
        projectId,
        reviewCaseId: caseId,
        status: 'receiving',
        files: [
          {
            filename: '내부산출서.csv',
            documentKind: 'takeoff',
            status: 'upload_pending',
          },
        ],
      },
    });
    expect(JSON.stringify(body)).not.toContain('r2ObjectKey');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('requires a strong idempotency key', async () => {
    const response = await POST(request({ 'idempotency-key': '' }), context);
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects cross-site, wrong media type and malformed identifiers', async () => {
    const crossSite = await POST(
      request({ 'sec-fetch-site': 'cross-site' }),
      context,
    );
    expect(crossSite.status).toBe(403);
    const wrongType = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          'idempotency-key': 'upload-package-0001',
        },
        body: '{}',
      }),
      context,
    );
    expect(wrongType.status).toBe(415);
    const invalidId = await POST(request(), {
      params: Promise.resolve({ projectId: 'invalid', caseId }),
    });
    expect(invalidId.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects unsafe filenames before persistence', async () => {
    const response = await POST(
      request({}, { filename: '../산출서.csv' }),
      context,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'FILE_NAME_INVALID' },
    });
    expect(create).not.toHaveBeenCalled();
  });
});

function request(
  headers: Record<string, string> = {},
  file: Record<string, unknown> = {},
): Request {
  return new Request(
    `http://localhost/api/projects/${projectId}/cases/${caseId}/source-packages`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'upload-package-0001',
        ...headers,
      },
      body: JSON.stringify({
        displayName: '1차 검수 자료',
        files: [
          {
            filename: '내부산출서.csv',
            contentType: 'text/csv',
            sizeBytes: 12,
            purpose: 'quantity_source',
            ...file,
          },
        ],
      }),
    },
  );
}
