// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { DriveStorage } from './drive-storage';
import { inspectSourceFile } from '@/lib/imports/inspect-source-file';

const mocks = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('./drive-settings', () => ({
  connectionToken: async () => 'synthetic',
}));
vi.mock('./google-drive', async (original) => ({
  ...(await original<typeof import('./google-drive')>()),
  driveFiles: () => ({
    allocateId: async () => 'syntheticFile123',
    verify: mocks.verify,
  }),
}));

describe('Drive storage media type boundary', () => {
  it('stores inspector CSV media type without changing bytes/hash and can retry', async () => {
    let row: Record<string, unknown> | null = null;
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () =>
            sql.includes('qc_drive_object')
              ? row
              : { id: 'connection', folder_id: 'folder' },
          run: async () => {
            if (sql.startsWith('INSERT'))
              row = {
                object_key: args[0],
                connection_id: args[1],
                file_id: args[2],
                sha256: args[3],
                size: args[4],
                content_type: args[5],
                state: 'reserved',
              };
            if (sql.startsWith('UPDATE') && row) row.state = 'stored';
            return { meta: { changes: 1 } };
          },
        }),
        first: async () => ({ id: 'connection', folder_id: 'folder' }),
      }),
    } as unknown as D1Database;
    const bytes = new TextEncoder().encode('품명,물량\n미장,10\n');
    const inspection = await inspectSourceFile({
      filename: 'test.csv',
      contentType: 'text/csv',
      body: bytes,
    });
    const storage = new DriveStorage(db, 'synthetic');
    const input = {
      projectId: '11111111-1111-4111-8111-111111111111',
      caseId: '22222222-2222-4222-8222-222222222222',
      sourceVersionId: '33333333-3333-4333-8333-333333333333',
      fileId: '44444444-4444-4444-8444-444444444444',
      extension: 'csv' as const,
      body: bytes,
      contentType: inspection.detectedContentType,
      expectedSha256: inspection.sha256,
    };
    expect(inspection.detectedContentType).toBe('text/csv; charset=utf-8');
    for (let retry = 0; retry < 2; retry++)
      expect(await storage.putSourceFile(input)).toEqual({
        sha256: inspection.sha256,
        size: bytes.length,
      });
    expect(row).toMatchObject({
      content_type: 'text/csv',
      sha256: inspection.sha256,
      state: 'stored',
    });
    expect(mocks.verify).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentType: 'text/csv',
        sha256: inspection.sha256,
      }),
    );
  });
  it('still rejects unexpected parameters and header injection before storage', async () => {
    const prepare = vi.fn();
    const storage = new DriveStorage(
      { prepare } as unknown as D1Database,
      'synthetic',
    );
    for (const contentType of ['text/csv; x=1', 'text/csv\r\nX: bad']) {
      await expect(
        storage.put(
          'projects/11111111-1111-4111-8111-111111111111/cases/22222222-2222-4222-8222-222222222222/reviews/test.json',
          new Uint8Array([1]),
          contentType,
        ),
      ).rejects.toThrow();
    }
    expect(prepare).not.toHaveBeenCalled();
  });
});
