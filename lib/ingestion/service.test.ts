import { describe, expect, it } from 'vitest';
import type { Actor } from '@/lib/domain/contracts';
import type { SourcePackageSummary } from './contracts';
import type {
  NewSourcePackageRecord,
  SourcePackageRepository,
} from './repository';
import { SourcePackageService } from './service';

const actor: Actor = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'reviewer@example.test',
  displayName: '검수자',
  source: 'development_mock',
};
const projectId = '22222222-2222-4222-8222-222222222222';
const reviewCaseId = '33333333-3333-4333-8333-333333333333';
const idempotencyKey = 'upload-package-0001';

describe('SourcePackageService', () => {
  it('lists only the actor-scoped project and review-case packages', async () => {
    const repository = new CapturingRepository();
    const service = new SourcePackageService(repository);

    await expect(service.list(projectId, reviewCaseId, actor)).resolves.toEqual(
      [],
    );
    expect(repository.listCalls).toEqual([
      { projectId, reviewCaseId, actorId: actor.id },
    ]);
  });

  it('creates opaque upload intents for normalized 산출서와 집계표 declarations', async () => {
    const repository = new CapturingRepository();
    const service = new SourcePackageService(
      repository,
      () => new Date('2026-09-01T00:00:00.000Z'),
    );
    const summary = await service.create(
      projectId,
      reviewCaseId,
      actor,
      {
        displayName: '1차 검수 자료',
        files: [
          {
            filename: ' 내부산출서.xlsx ',
            contentType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: 128,
            purpose: 'quantity_source',
          },
          {
            filename: '동별집계표.csv',
            contentType: 'text/csv',
            sizeBytes: 64,
            purpose: 'quantity_source',
          },
        ],
      },
      idempotencyKey,
      'request-1',
    );

    expect(summary).toMatchObject({
      projectId,
      reviewCaseId,
      status: 'receiving',
      projectIdentityStatus: 'pending',
      files: [
        { filename: '내부산출서.xlsx', documentKind: 'takeoff' },
        { filename: '동별집계표.csv', documentKind: 'summary' },
      ],
    });
    const record = repository.records[0];
    expect(record.requestHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(record.files[0].r2ObjectKey).not.toContain('내부산출서');
    expect(summary.files[0]).not.toHaveProperty('uploadPath');
    expect(record.expiresAt.toISOString()).toBe('2026-09-02T00:00:00.000Z');
  });

  it('derives the same request fingerprint regardless of file order', async () => {
    const repository = new CapturingRepository();
    const service = new SourcePackageService(repository);
    const files = [
      {
        filename: '내부산출서.csv',
        contentType: 'text/csv',
        sizeBytes: 10,
        purpose: 'quantity_source' as const,
      },
      {
        filename: '동별집계표.csv',
        contentType: 'text/csv',
        sizeBytes: 20,
        purpose: 'quantity_source' as const,
      },
    ];
    await service.create(
      projectId,
      reviewCaseId,
      actor,
      { displayName: '검수 묶음', files },
      idempotencyKey,
      'request-a',
    );
    await service.create(
      projectId,
      reviewCaseId,
      actor,
      { displayName: '검수 묶음', files: [...files].reverse() },
      'upload-package-0002',
      'request-b',
    );
    expect(repository.records[0].requestHash).toBe(
      repository.records[1].requestHash,
    );
  });

  it('binds the request fingerprint to project and review-case scope', async () => {
    const repository = new CapturingRepository();
    const service = new SourcePackageService(repository);
    const input = {
      displayName: '검수 묶음',
      files: [
        {
          filename: '내부산출서.csv',
          contentType: 'text/csv',
          sizeBytes: 10,
          purpose: 'quantity_source' as const,
        },
      ],
    };
    await service.create(
      projectId,
      reviewCaseId,
      actor,
      input,
      idempotencyKey,
      'request-a',
    );
    await service.create(
      projectId,
      '44444444-4444-4444-8444-444444444444',
      actor,
      input,
      idempotencyKey,
      'request-b',
    );
    expect(repository.records[0].requestHash).not.toBe(
      repository.records[1].requestHash,
    );
  });

  it('rejects unsafe filenames, unsupported types and weak idempotency keys', async () => {
    const service = new SourcePackageService(new CapturingRepository());
    await expect(
      service.create(
        projectId,
        reviewCaseId,
        actor,
        {
          displayName: '검수 묶음',
          files: [
            {
              filename: '../산출서.xlsx',
              contentType: 'application/octet-stream',
              sizeBytes: 10,
              purpose: 'quantity_source',
            },
          ],
        },
        idempotencyKey,
        'request-1',
      ),
    ).rejects.toMatchObject({ code: 'FILE_NAME_INVALID' });
    await expect(
      service.create(
        projectId,
        reviewCaseId,
        actor,
        {
          displayName: '검수 묶음',
          files: [
            {
              filename: '산출서.pdf',
              contentType: 'application/pdf',
              sizeBytes: 10,
              purpose: 'quantity_source',
            },
          ],
        },
        idempotencyKey,
        'request-1',
      ),
    ).rejects.toMatchObject({ code: 'FILE_EXTENSION_UNSUPPORTED' });
    await expect(
      service.create(
        projectId,
        reviewCaseId,
        actor,
        {
          displayName: '검수 묶음',
          files: [
            {
              filename: '산출서.csv',
              contentType: 'text/csv',
              sizeBytes: 10,
              purpose: 'quantity_source',
            },
          ],
        },
        'short',
        'request-1',
      ),
    ).rejects.toBeTruthy();
  });

  it('rejects duplicate normalized filenames in one source package', async () => {
    const service = new SourcePackageService(new CapturingRepository());
    await expect(
      service.create(
        projectId,
        reviewCaseId,
        actor,
        {
          displayName: '검수 묶음',
          files: [
            {
              filename: '산출서.csv',
              contentType: 'text/csv',
              sizeBytes: 10,
              purpose: 'quantity_source',
            },
            {
              filename: ' 산출서.csv ',
              contentType: 'text/csv',
              sizeBytes: 10,
              purpose: 'quantity_source',
            },
          ],
        },
        idempotencyKey,
        'request-1',
      ),
    ).rejects.toMatchObject({ code: 'FILE_NAME_INVALID' });
  });
});

class CapturingRepository implements SourcePackageRepository {
  readonly records: NewSourcePackageRecord[] = [];
  readonly listCalls: Array<{
    projectId: string;
    reviewCaseId: string;
    actorId: string;
  }> = [];

  listForActor(
    scopedProjectId: string,
    scopedReviewCaseId: string,
    actorId: string,
  ): Promise<SourcePackageSummary[]> {
    this.listCalls.push({
      projectId: scopedProjectId,
      reviewCaseId: scopedReviewCaseId,
      actorId,
    });
    return Promise.resolve([]);
  }

  create(record: NewSourcePackageRecord): Promise<SourcePackageSummary> {
    this.records.push(record);
    return Promise.resolve({
      id: record.id,
      projectId: record.projectId,
      reviewCaseId: record.reviewCaseId,
      displayName: record.displayName,
      status: 'receiving',
      projectIdentityStatus: 'pending',
      files: record.files.map((file) => ({
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
    });
  }
}
