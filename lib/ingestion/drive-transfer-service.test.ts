// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../../tests/helpers/sqlite-d1';
import type { Actor } from '@/lib/domain/contracts';
import { DriveError } from '@/lib/files/google-drive';
import { DriveTransferService } from './drive-transfer-service';
import { SourcePackageService } from './service';
import { inspectSourceFile } from '@/lib/imports/inspect-source-file';
import {
  readWorkbook,
  suggestMapping,
  canonicalRows,
} from '@/lib/review/workbook';
import { defaultProfile, type Run } from '@/lib/review/contracts';
import { reviewRows } from '@/lib/review/engine';
import { reviewWithGemini } from '@/lib/review/gemini-review';
import { exportReview } from '@/lib/review/report';
const mocks = vi.hoisted(() => ({
  binding: undefined as unknown,
  send: vi.fn(),
  probe: vi.fn(),
  metadata: vi.fn(),
  begin: vi.fn(),
  token: vi.fn(),
}));
vi.mock('@/db', () => ({ getD1Binding: () => mocks.binding }));
vi.mock('@/lib/files/drive-settings', () => ({
  connectionToken: mocks.token,
}));
vi.mock('@/lib/server/ai/personal-settings', () => ({
  decryptKey: async () =>
    'https://www.googleapis.com/upload/drive/v3/files?upload_id=synthetic-secret',
  encryptKey: async () => 'encrypted-synthetic',
}));
vi.mock('@/lib/files/drive-transfer', () => ({
  DRIVE_TRANSFER_CHUNK_BYTES: 1048576,
  driveTransfer: () => ({
    send: mocks.send,
    probe: mocks.probe,
    metadata: mocks.metadata,
    begin: mocks.begin,
  }),
}));
const { D1SourcePackageRepository } = await import('./d1-repository');
const actor: Actor = {
  id: 'owner',
  email: 'employee@example.test',
  displayName: 'Employee',
  source: 'development_mock',
};
const projectId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';
const connectionId = '33333333-3333-4333-8333-333333333333';
const bytes = new TextEncoder().encode('a,b\n1,2\n');
const done = {
  complete: true,
  offset: bytes.length,
  metadata: { size: bytes.length, sha256: 'a'.repeat(64) },
};
let f: ReturnType<typeof sqliteD1>;
let service: DriveTransferService;
let uploadId: string;
let versionId: string;
let packageId: string;
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.token.mockResolvedValue('synthetic-token');
  f = sqliteD1();
  mocks.binding = f.db;
  f.sqlite
    .exec(`INSERT INTO user_profile VALUES ('owner','employee@example.test','Employee',1);
    INSERT INTO project VALUES ('${projectId}','TEST','Test',NULL,'active','owner',1);
    INSERT INTO project_member VALUES ('membership','${projectId}','owner','reviewer',1);
    INSERT INTO review_case VALUES ('${caseId}','${projectId}','FIN','FIN','draft','owner',NULL,NULL,1);
    INSERT INTO qc_drive_connection(id,email,client_id,encrypted_secret,encrypted_refresh,folder_id,state,created_at)
      VALUES('${connectionId}','company@example.test','synthetic','encrypted','encrypted','syntheticFolder123','ready','2026-09-09');`);
  const created = await new SourcePackageService(
    new D1SourcePackageRepository(),
  ).create(
    projectId,
    caseId,
    actor,
    {
      displayName: 'Synthetic transfer',
      files: [
        {
          filename: '산출서.csv',
          contentType: 'text/csv',
          sizeBytes: bytes.length,
          purpose: 'quantity_source',
        },
      ],
    },
    'synthetic-idempotency-123',
    'test-create',
  );
  uploadId = created.files[0].uploadId;
  versionId = created.files[0].sourceVersionId;
  packageId = created.id;
  f.sqlite
    .prepare(
      "INSERT INTO qc_drive_upload(upload_id,connection_id,file_id,encrypted_session,state,expected_sha256) VALUES(?,?,?,'encrypted-synthetic','uploading',?)",
    )
    .run(uploadId, connectionId, 'syntheticFile123', 'a'.repeat(64));
  service = new DriveTransferService(f.db, 'a'.repeat(64));
  mocks.send.mockResolvedValue(done);
  mocks.probe.mockResolvedValue({ complete: false, offset: 0 });
});
afterEach(() => f.close());
const advance = () =>
  service.advance(
    uploadId,
    actor,
    'test-send',
    {
      offset: 0,
      read: async () => bytes,
    },
    'a'.repeat(64),
  );

describe('registered original inspection input', () => {
  it('prepares the existing Drive object once without another upload', async () => {
    const { reader, media, hash } = await registeredReader();
    expect(await reader.prepare(uploadId, actor, 'prepare')).toEqual({
      sourceVersionId: versionId,
      prepared: true,
    });
    expect(
      f.sqlite
        .prepare(
          'SELECT status,sha256,extension_detected FROM source_file_version',
        )
        .get(),
    ).toEqual({ status: 'stored', sha256: hash, extension_detected: 'csv' });
    expect(f.sqlite.prepare('SELECT state FROM upload_attempt').get()).toEqual({
      state: 'finalized',
    });
    expect(f.sqlite.prepare('SELECT status FROM source_package').get()).toEqual(
      { status: 'stored_unverified' },
    );
    expect(
      f.sqlite
        .prepare('SELECT file_id,connection_id,state FROM qc_drive_object')
        .get(),
    ).toEqual({
      file_id: 'syntheticFile123',
      connection_id: connectionId,
      state: 'stored',
    });
    expect(await reader.prepare(uploadId, actor, 'retry')).toEqual({
      sourceVersionId: versionId,
      prepared: true,
    });
    expect(media).toHaveBeenCalledTimes(1);
    expect(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM audit_event WHERE action='source_file.inspected'",
        )
        .get(),
    ).toEqual({ n: 1 });
    expect(mocks.begin).not.toHaveBeenCalled();
  });
  it('does not promote bytes whose checksum fails', async () => {
    const { reader, media } = await registeredReader();
    media.mockImplementation(
      async () =>
        new Response(new TextEncoder().encode('a,b\n9,9\n'), {
          status: 206,
          headers: {
            'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
            'content-length': String(bytes.length),
          },
        }),
    );
    await expect(reader.prepare(uploadId, actor, 'bad')).rejects.toThrow();
    expect(
      f.sqlite.prepare('SELECT status FROM source_file_version').get(),
    ).toEqual({ status: 'uploaded' });
    expect(
      f.sqlite.prepare('SELECT COUNT(*) n FROM qc_drive_object').get(),
    ).toEqual({ n: 0 });
  });
  it('rolls back preparation when the final write fails', async () => {
    const { reader } = await registeredReader();
    f.sqlite.exec(
      "CREATE TRIGGER reject_prepare BEFORE UPDATE ON upload_attempt WHEN NEW.state='finalized' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;",
    );
    await expect(reader.prepare(uploadId, actor, 'fail')).rejects.toThrow(
      'synthetic failure',
    );
    expect(
      f.sqlite.prepare('SELECT status FROM source_file_version').get(),
    ).toEqual({ status: 'uploaded' });
    expect(
      f.sqlite.prepare('SELECT COUNT(*) n FROM qc_drive_object').get(),
    ).toEqual({ n: 0 });
    expect(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM audit_event WHERE action='source_file.inspected'",
        )
        .get(),
    ).toEqual({ n: 0 });
    f.sqlite.exec('DROP TRIGGER reject_prepare');
    expect(await reader.prepare(uploadId, actor, 'fail')).toEqual({
      sourceVersionId: versionId,
      prepared: true,
    });
  });
  it.each(['expected_sha256', 'acknowledged_bytes'])(
    'rejects %s changed during the final hash',
    async (field) => {
      const { reader } = await registeredReader();
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      const spy = vi
        .spyOn(crypto.subtle, 'digest')
        .mockImplementation(async (algorithm, data) => {
          const result = await digest(algorithm, data);
          if (data.byteLength === bytes.byteLength) {
            if (field === 'expected_sha256')
              f.sqlite
                .prepare('UPDATE qc_drive_upload SET expected_sha256=?')
                .run('b'.repeat(64));
            else
              f.sqlite.exec('UPDATE qc_drive_upload SET acknowledged_bytes=0');
          }
          return result;
        });
      try {
        await expect(
          reader.readForInspection(uploadId, actor, 'race'),
        ).rejects.toThrow('등록 상태');
      } finally {
        spy.mockRestore();
      }
    },
  );
  async function registeredReader() {
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    f.sqlite.prepare('UPDATE qc_drive_upload SET expected_sha256=?').run(hash);
    const complete = {
      ...done,
      metadata: { size: bytes.length, sha256: hash },
    };
    mocks.send.mockResolvedValue(complete);
    await service.advance(
      uploadId,
      actor,
      'register',
      { offset: 0, read: async () => bytes },
      hash,
    );
    mocks.metadata.mockResolvedValue(complete.metadata);
    const media = vi.fn(
      async () =>
        new Response(bytes, {
          status: 206,
          headers: {
            'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
            'content-length': String(bytes.length),
          },
        }),
    );
    return {
      reader: new DriveTransferService(f.db, 'a'.repeat(64), media),
      media,
      hash,
    };
  }
  it('reads provider bytes with lineage and real hash but never marks inspection complete', async () => {
    const { reader, hash, media } = await registeredReader();
    const result = await reader.readForInspection(uploadId, actor, 'inspect');
    expect(result).toMatchObject({
      projectId,
      caseId,
      sourceVersionId: versionId,
      sha256: hash,
      format: 'csv',
    });
    expect(result.body).toEqual(bytes);
    expect(media).toHaveBeenCalledTimes(1);
    expect(
      f.sqlite
        .prepare('SELECT status FROM source_file_version WHERE id=?')
        .get(versionId),
    ).toEqual({ status: 'uploaded' });
    expect(f.sqlite.prepare('SELECT COUNT(*) n FROM import_job').get()).toEqual(
      { n: 0 },
    );
  });
  it('runs registered CSV bytes through inspection, explicit mapping, mock Gemini and a readable XLSX report', async () => {
    const { reader, hash } = await registeredReader();
    const original = await reader.readForInspection(uploadId, actor, 'cycle');
    const inspection = await inspectSourceFile(original);
    expect(inspection.sha256).toBe(hash);
    const sheets = readWorkbook(original.body, original.format);
    const mapping = {
      ...suggestMapping(sheets[0], versionId, original.filename),
      confirmed: true,
    };
    // Synthetic a/b columns are confirmed explicitly, never guessed for a real workbook.
    mapping.columns.item = 0;
    mapping.columns.quantity = 1;
    const rows = canonicalRows(sheets[0], mapping, {
      sourceVersionId: versionId,
      filename: original.filename,
      sha256: hash,
    });
    expect(rows).toHaveLength(1);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    checks: [
                      {
                        instructionId: 'D1',
                        rowId: 'R1',
                        status: 'suspected',
                        reason: '단위 확인 필요',
                        evidence: ['단위가 비어 있음'],
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
    const ai = await reviewWithGemini({
      apiKey: 'synthetic-key',
      model: 'gemini-test-flash',
      rows,
      instructions: [{ id: 'D1', text: '단위 누락 검토', enabled: true }],
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(ai.findings).toHaveLength(1);
    expect(ai.findings[0]).toMatchObject({
      level: 'C',
      confidence: 'candidate',
    });
    const basic = reviewRows(rows, defaultProfile);
    const run: Run = {
      ...basic,
      id: crypto.randomUUID(),
      projectId,
      caseId,
      createdAt: new Date().toISOString(),
      actorId: actor.id,
      profileId: 'synthetic-profile',
      profileVersion: 1,
      trial: true,
      profile: defaultProfile,
      mappings: [mapping],
      rows,
      findings: [...basic.findings, ...ai.findings],
      coverage: [...basic.coverage, ...ai.coverage],
      limitations: [...basic.limitations, ...ai.limitations],
      sources: rows.map((row) => row.ref),
      ai: ai.ai,
    };
    const report = exportReview(run, []);
    const parsed = readWorkbook(report, 'xlsx');
    const text = parsed
      .flatMap((s) => s.rows.flatMap((row) => row.cells))
      .join('\n');
    expect(text).toContain(versionId);
    expect(text).toContain(hash);
    expect(text).toContain('AI 지침 검토 후보');
    expect(
      f.sqlite
        .prepare('SELECT status FROM source_file_version WHERE id=?')
        .get(versionId),
    ).toEqual({ status: 'uploaded' });
  });
  it.each(['viewer', 'approver'])(
    'denies %s before provider access',
    async (role) => {
      const { reader, media } = await registeredReader();
      f.sqlite.prepare('UPDATE project_member SET role=?').run(role);
      await expect(
        reader.readForInspection(uploadId, actor, 'inspect'),
      ).rejects.toThrow('권한');
      expect(media).not.toHaveBeenCalled();
    },
  );
  it('rejects disagreement between registration records before downloading', async () => {
    const { reader, media } = await registeredReader();
    f.sqlite
      .prepare('UPDATE source_file_version SET sha256=?')
      .run('b'.repeat(64));
    await expect(
      reader.readForInspection(uploadId, actor, 'inspect'),
    ).rejects.toThrow('무결성');
    expect(media).not.toHaveBeenCalled();
  });
  it('rejects changed actual bytes even when provider metadata claims the saved hash', async () => {
    const { reader, media } = await registeredReader();
    media.mockImplementation(
      async () =>
        new Response(new Uint8Array(bytes.length), {
          status: 206,
          headers: {
            'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
          },
        }),
    );
    await expect(
      reader.readForInspection(uploadId, actor, 'inspect'),
    ).rejects.toThrow('무결성');
  });
  it('discards the read when membership is revoked during provider I/O', async () => {
    const { reader, media } = await registeredReader();
    media.mockImplementation(async () => {
      f.sqlite.exec('DELETE FROM project_member');
      return new Response(bytes, {
        status: 206,
        headers: {
          'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
        },
      });
    });
    await expect(
      reader.readForInspection(uploadId, actor, 'inspect'),
    ).rejects.toThrow('권한');
  });
});

function attachment(extension: 'pdf' | 'dwg' | 'dxf', size: number) {
  const id = crypto.randomUUID();
  f.sqlite
    .prepare(`INSERT INTO qc_drawing_attachment(id,project_id,review_case_id,filename,extension,size_bytes,created_by,created_at,expires_at,idempotency_key)
    VALUES(?,?,?,?,?,?,'owner',?,?,?)`)
    .run(
      id,
      projectId,
      caseId,
      `도면.${extension}`,
      extension,
      size,
      Date.now(),
      Date.now() + 60000,
      id,
    );
  f.sqlite
    .prepare(
      "INSERT INTO qc_drive_upload(upload_id,connection_id,file_id,encrypted_session,state,expected_sha256) VALUES(?,?,?,'encrypted-synthetic','uploading',?)",
    )
    .run(id, connectionId, `synthetic-${id}`, 'b'.repeat(64));
  return id;
}

describe('request-local Drive token reuse', () => {
  function freshTransfer(duringAllocation?: () => void) {
    f.sqlite.exec(`DELETE FROM qc_drive_upload;
      INSERT INTO qc_drive_settings VALUES(1,'synthetic','encrypted','company@example.test','${connectionId}',1);`);
    mocks.metadata.mockRejectedValue(
      new DriveError('DRIVE_NOT_FOUND', 'synthetic', 404),
    );
    mocks.begin.mockResolvedValue(
      'https://www.googleapis.com/upload/drive/v3/files?upload_id=synthetic-secret',
    );
    service = new DriveTransferService(
      f.db,
      'a'.repeat(64),
      vi.fn(async () => {
        duringAllocation?.();
        return Response.json({ ids: ['syntheticFile123'] });
      }),
    );
    return service.advance(
      uploadId,
      actor,
      'initialize',
      undefined,
      'a'.repeat(64),
    );
  }

  it('refreshes once during initialization and refreshes again on the next request', async () => {
    await expect(freshTransfer()).resolves.toMatchObject({
      status: 'uploading',
      offset: 0,
    });
    expect(mocks.token).toHaveBeenCalledTimes(1);
    expect(mocks.probe).toHaveBeenCalledTimes(1);
    await advance();
    expect(mocks.token).toHaveBeenCalledTimes(2);
  });

  it.each(['client_id', 'encrypted_secret', 'encrypted_refresh'])(
    'does not reuse a token after %s rotation',
    async (field) => {
      await freshTransfer(() => {
        f.sqlite
          .prepare(`UPDATE qc_drive_connection SET ${field}=? WHERE id=?`)
          .run('rotated', connectionId);
      });
      expect(mocks.token).toHaveBeenCalledTimes(2);
      expect(mocks.token.mock.calls[1][0][field]).toBe('rotated');
    },
  );

  it('still rejects a connection revoked after initial token issuance', async () => {
    await expect(
      freshTransfer(() => {
        f.sqlite
          .prepare("UPDATE qc_drive_connection SET state='revoked' WHERE id=?")
          .run(connectionId);
      }),
    ).rejects.toMatchObject({ code: 'DRIVE_RECONNECT_REQUIRED' });
    expect(mocks.token).toHaveBeenCalledTimes(1);
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it('refreshes for a different connection when a concurrent initialization wins', async () => {
    const otherId = '44444444-4444-4444-8444-444444444444';
    await freshTransfer(() => {
      f.sqlite
        .prepare(`INSERT INTO qc_drive_connection
        SELECT ?,email,client_id,encrypted_secret,encrypted_refresh,folder_id,state,created_at
        FROM qc_drive_connection WHERE id=?`)
        .run(otherId, connectionId);
      f.sqlite
        .prepare(`INSERT INTO qc_drive_upload(upload_id,connection_id,file_id,state,expected_sha256)
        VALUES(?,?,?,'uploading',?)`)
        .run(uploadId, otherId, 'syntheticOther123', 'a'.repeat(64));
    });
    expect(mocks.token).toHaveBeenCalledTimes(2);
    expect(mocks.token.mock.calls[1][0].id).toBe(otherId);
  });
});

describe('drawing-only transfer registration', () => {
  it.each([
    ['pdf', '%PDF-1.7\nbody'],
    ['dwg', 'AC1032binary-data'],
    ['dxf', '0\nSECTION\n2\nHEADER\n'],
    ['dxf', 'AutoCAD Binary DXF\r\n\x1a\0body'],
  ] as const)(
    'registers %s signature without adding source/parser records',
    async (extension, header) => {
      const body = new TextEncoder().encode(header);
      const id = attachment(extension, body.length);
      mocks.send.mockResolvedValue({
        complete: true,
        offset: body.length,
        metadata: { sha256: 'b'.repeat(64), size: body.length },
      });
      expect(
        await service.advance(
          id,
          actor,
          'drawing',
          {
            offset: 0,
            read: async () => body,
          },
          'b'.repeat(64),
        ),
      ).toMatchObject({ status: 'uploaded', sizeBytes: body.length });
      expect(
        f.sqlite
          .prepare('SELECT status,sha256 FROM qc_drawing_attachment WHERE id=?')
          .get(id),
      ).toMatchObject({ status: 'uploaded', sha256: 'b'.repeat(64) });
      expect(
        f.sqlite.prepare('SELECT COUNT(*) AS n FROM source_file_version').get()
          ?.n,
      ).toBe(1);
      expect(
        f.sqlite.prepare('SELECT COUNT(*) AS n FROM import_job').get()?.n,
      ).toBe(0);
    },
  );
  it.each(['pdf', 'dwg', 'dxf'] as const)(
    'rejects invalid %s content without uploading',
    async (extension) => {
      const id = attachment(extension, bytes.length);
      await expect(
        service.advance(
          id,
          actor,
          'invalid',
          {
            offset: 0,
            read: async () => bytes,
          },
          'b'.repeat(64),
        ),
      ).rejects.toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH' });
      expect(mocks.send).not.toHaveBeenCalled();
    },
  );
  it('transfers a >20MiB drawing using only bounded chunks and resumes its last chunk', async () => {
    const total = 21 * 1024 * 1024 + 3;
    const id = attachment('pdf', total);
    const first = new Uint8Array(1048576);
    first.set(new TextEncoder().encode('%PDF-1.7\n'));
    const read = vi.fn(async () => first);
    mocks.send.mockResolvedValueOnce({ complete: false, offset: first.length });
    expect(
      await service.advance(
        id,
        actor,
        'first',
        { offset: 0, read },
        'b'.repeat(64),
      ),
    ).toMatchObject({ offset: 1048576, status: 'uploading' });
    expect(read).toHaveBeenCalledWith(1048576);
    mocks.probe.mockResolvedValueOnce({ complete: false, offset: total - 3 });
    expect(
      await service.advance(id, actor, 'resume', undefined, 'b'.repeat(64)),
    ).toMatchObject({
      offset: total - 3,
    });
    mocks.send.mockResolvedValueOnce({
      complete: true,
      offset: total,
      metadata: { size: total, sha256: 'b'.repeat(64) },
    });
    const last = vi.fn(async () => new Uint8Array(3));
    expect(
      await service.advance(
        id,
        actor,
        'last',
        {
          offset: total - 3,
          read: last,
        },
        'b'.repeat(64),
      ),
    ).toMatchObject({ status: 'uploaded', offset: total });
    expect(last).toHaveBeenCalledWith(3);
  });
  it('rejects malformed callback sizes and permissions for attachments', async () => {
    const id = attachment('pdf', 20);
    await expect(
      service.advance(
        id,
        actor,
        'short',
        {
          offset: 0,
          read: async () => bytes,
        },
        'b'.repeat(64),
      ),
    ).rejects.toMatchObject({ code: 'FILE_SIZE_MISMATCH' });
    f.sqlite.exec("UPDATE project_member SET role='viewer'");
    await expect(service.status(id, actor)).rejects.toThrow('권한');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('keeps checksum-pending drawings pending and excludes archived case', async () => {
    const body = new TextEncoder().encode('%PDF-1.7\nbody');
    const id = attachment('pdf', body.length);
    mocks.send.mockRejectedValue(
      new DriveError('DRIVE_CHECKSUM_PENDING', 'pending', 409),
    );
    await expect(
      service.advance(
        id,
        actor,
        'pending',
        {
          offset: 0,
          read: async () => body,
        },
        'b'.repeat(64),
      ),
    ).rejects.toMatchObject({ code: 'DRIVE_CHECKSUM_PENDING' });
    expect(
      f.sqlite
        .prepare('SELECT status,sha256 FROM qc_drawing_attachment WHERE id=?')
        .get(id),
    ).toMatchObject({ status: 'upload_pending', sha256: null });
    f.sqlite.exec("UPDATE review_case SET status='archived'");
    await expect(service.status(id, actor)).rejects.toThrow('권한');
  });
});

describe('Drive registration integration and authorization', () => {
  it('calls media fetch without binding the service as its receiver', async () => {
    await advance();
    mocks.metadata.mockResolvedValue(done.metadata);
    const fetcher = vi.fn<typeof fetch>(async function (this: unknown) {
      if (this !== undefined) throw new TypeError('Illegal invocation');
      return new Response(bytes, {
        status: 206,
        headers: { 'content-range': 'bytes 0-7/8', 'content-length': '8' },
      });
    });
    const reading = new DriveTransferService(f.db, 'a'.repeat(64), fetcher);
    const response = await reading.original(
      uploadId,
      actor,
      'unbound',
      'bytes=0-7',
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('returns exact bounded ranges and audits only the first chunk', async () => {
    await advance();
    mocks.metadata.mockResolvedValue(done.metadata);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(bytes.slice(0, 4), {
          status: 206,
          headers: { 'content-range': 'bytes 0-3/8', 'content-length': '4' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(bytes.slice(4), {
          status: 206,
          headers: { 'content-range': 'bytes 4-7/8', 'content-length': '4' },
        }),
      );
    const reading = new DriveTransferService(f.db, 'a'.repeat(64), fetcher);
    const first = await reading.original(
      uploadId,
      actor,
      'first-range',
      'bytes=0-3',
    );
    expect(first.status).toBe(206);
    expect(first.headers.get('content-range')).toBe('bytes 0-3/8');
    expect(first.headers.get('x-original-sha256')).toBe(done.metadata.sha256);
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(
      bytes.slice(0, 4),
    );
    await reading.original(uploadId, actor, 'last-range', 'bytes=4-7');
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('range')).toBe(
      'bytes=4-7',
    );
    expect(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM audit_event WHERE action='original.download_started'",
        )
        .get()?.n,
    ).toBe(1);
  });
  it.each([
    'bytes=0-',
    'bytes=-4',
    'bytes=0-3,4-7',
    'bytes=7-4',
    'bytes=0-8',
    'bytes=9007199254740992-9007199254740993',
  ])('rejects malformed range %s before provider calls', async (range) => {
    await advance();
    await expect(
      service.original(uploadId, actor, 'bad-range', range),
    ).rejects.toMatchObject({ status: 416 });
    expect(mocks.metadata).not.toHaveBeenCalled();
  });
  it('requires <=1MiB ranges for large drawings', async () => {
    const id = attachment('pdf', 24 * 1024 * 1024);
    await expect(service.original(id, actor)).rejects.toMatchObject({
      status: 416,
    });
    await expect(
      service.original(id, actor, 'oversized', 'bytes=0-1048576'),
    ).rejects.toMatchObject({ status: 416 });
    expect(mocks.metadata).not.toHaveBeenCalled();
  });
  it.each([
    { status: 200, range: 'bytes 0-3/8', body: new Uint8Array(4) },
    { status: 206, range: 'bytes 1-4/8', body: new Uint8Array(4) },
    { status: 206, range: 'bytes 0-3/8', body: new Uint8Array(5) },
    { status: 206, range: 'bytes 0-3/8', body: new Uint8Array(3) },
  ])(
    'rejects provider range/status/actual-length mismatch %#',
    async ({ status, range, body }) => {
      await advance();
      mocks.metadata.mockResolvedValue(done.metadata);
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(body, { status, headers: { 'content-range': range } }),
        );
      await expect(
        new DriveTransferService(f.db, 'a'.repeat(64), fetcher).original(
          uploadId,
          actor,
          'bad-provider',
          'bytes=0-3',
        ),
      ).rejects.toMatchObject({ code: 'DRIVE_DOWNLOAD_FAILED' });
    },
  );
  it('allows a project viewer to download a registered original but not upload', async () => {
    await advance();
    f.sqlite.exec("UPDATE project_member SET role='viewer'");
    mocks.metadata.mockResolvedValue(done.metadata);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(bytes, {
        headers: { 'content-length': String(bytes.length) },
      }),
    );
    const reading = new DriveTransferService(f.db, 'a'.repeat(64), fetcher);
    const response = await reading.original(uploadId, actor);
    expect(response.headers.get('content-disposition')).toContain(
      'attachment;',
    );
    expect(response.headers.get('content-disposition')).toContain(
      encodeURIComponent('산출서.csv'),
    );
    expect(response.headers.get('content-type')).toBe(
      'application/octet-stream',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual');
    await expect(
      reading.advance(uploadId, actor, 'viewer', undefined, 'a'.repeat(64)),
    ).rejects.toThrow('권한');
  });
  it('refuses original download for a non-member before provider access', async () => {
    await advance();
    const fetcher = vi.fn<typeof fetch>();
    const reading = new DriveTransferService(f.db, 'a'.repeat(64), fetcher);
    await expect(
      reading.original(uploadId, { ...actor, id: 'outsider' }),
    ).rejects.toThrow('권한');
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('never fetches bytes after registered digest differs from provider metadata', async () => {
    await advance();
    mocks.metadata.mockResolvedValue({
      ...done.metadata,
      sha256: 'f'.repeat(64),
    });
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      new DriveTransferService(f.db, 'a'.repeat(64), fetcher).original(
        uploadId,
        actor,
      ),
    ).rejects.toMatchObject({ code: 'FILE_INTEGRITY_MISMATCH' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([302, 308])(
    'does not follow a download redirect %i',
    async (status) => {
      await advance();
      mocks.metadata.mockResolvedValue(done.metadata);
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          status,
          headers: { location: 'https://attacker.example' },
        }),
      );
      await expect(
        new DriveTransferService(f.db, 'a'.repeat(64), fetcher).original(
          uploadId,
          actor,
        ),
      ).rejects.toMatchObject({ code: 'DRIVE_DOWNLOAD_FAILED' });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual');
    },
  );
  it('rejects original download whose declared size differs and rechecks revocation', async () => {
    await advance();
    mocks.metadata.mockResolvedValue(done.metadata);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(bytes, { headers: { 'content-length': '1' } }),
      );
    const reading = new DriveTransferService(f.db, 'a'.repeat(64), fetcher);
    await expect(reading.original(uploadId, actor)).rejects.toMatchObject({
      code: 'DRIVE_DOWNLOAD_FAILED',
    });
    fetcher.mockClear();
    mocks.metadata.mockImplementation(async () => {
      f.sqlite.exec('DELETE FROM project_member');
      return done.metadata;
    });
    await expect(reading.original(uploadId, actor)).rejects.toThrow('권한');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects a different reselected file fingerprint before provider I/O', async () => {
    await expect(
      service.advance(uploadId, actor, 'wrong-file', undefined, 'd'.repeat(64)),
    ).rejects.toThrow();
    expect(mocks.probe).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(
      f.sqlite
        .prepare(
          'SELECT expected_sha256,acknowledged_bytes FROM qc_drive_upload',
        )
        .get(),
    ).toMatchObject({ expected_sha256: 'a'.repeat(64), acknowledged_bytes: 0 });
  });
  it('does not finalize provider bytes whose fingerprint differs from the original selection', async () => {
    mocks.send.mockResolvedValue({
      ...done,
      metadata: { ...done.metadata, sha256: 'e'.repeat(64) },
    });
    await expect(advance()).rejects.toThrow();
    expect(
      f.sqlite.prepare('SELECT status,sha256 FROM source_file_version').get(),
    ).toMatchObject({ status: 'upload_pending', sha256: null });
    expect(
      f.sqlite
        .prepare('SELECT state,expected_sha256 FROM qc_drive_upload')
        .get(),
    ).toMatchObject({ state: 'uploading', expected_sha256: 'a'.repeat(64) });
  });
  it('requires a valid fingerprint to initialize or resume', async () => {
    await expect(
      service.advance(uploadId, actor, 'missing-hash'),
    ).rejects.toThrow();
    await expect(
      service.advance(uploadId, actor, 'invalid-hash', undefined, 'invalid'),
    ).rejects.toThrow();
    expect(mocks.probe).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('lets a project reviewer register company bytes without promoting parser readiness', async () => {
    const result = await advance();
    expect(result).toMatchObject({
      status: 'uploaded',
      sha256: done.metadata.sha256,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /encrypted|session|token|syntheticFile/,
    );
    expect(
      f.sqlite
        .prepare('SELECT status,sha256 FROM source_file_version WHERE id=?')
        .get(versionId),
    ).toMatchObject({ status: 'uploaded', sha256: done.metadata.sha256 });
    expect(
      f.sqlite.prepare('SELECT COUNT(*) AS n FROM import_job').get()?.n,
    ).toBe(0);
    expect(
      f.sqlite
        .prepare('SELECT encrypted_session,lease FROM qc_drive_upload')
        .get(),
    ).toMatchObject({ encrypted_session: null, lease: null });
    expect(
      await service.advance(
        uploadId,
        actor,
        'test-retry',
        undefined,
        'a'.repeat(64),
      ),
    ).toMatchObject({
      status: 'uploaded',
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it.each(['viewer', 'approver'])(
    'denies %s before reading bytes or provider access',
    async (role) => {
      f.sqlite.prepare('UPDATE project_member SET role=?').run(role);
      await expect(advance()).rejects.toThrow('권한');
      expect(mocks.send).not.toHaveBeenCalled();
    },
  );
  it('denies non-members, revoked memberships and aborted scope', async () => {
    await expect(
      service.status(uploadId, { ...actor, id: 'outsider' }),
    ).rejects.toThrow('권한');
    f.sqlite
      .prepare("UPDATE source_package SET status='aborted' WHERE id=?")
      .run(packageId);
    await expect(advance()).rejects.toThrow('권한');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('rejects expired active transfers and concurrent leases', async () => {
    f.sqlite
      .prepare('UPDATE qc_drive_upload SET lease_expires_at=?')
      .run(Date.now() + 60000);
    await expect(advance()).rejects.toThrow('다른 창');
    f.sqlite.exec(
      'UPDATE qc_drive_upload SET lease_expires_at=0; UPDATE upload_attempt SET expires_at=1',
    );
    await expect(advance()).rejects.toMatchObject({ code: 'UPLOAD_EXPIRED' });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('rejects wrong offset and signature without sending and releases lease', async () => {
    await expect(
      service.advance(
        uploadId,
        actor,
        'offset',
        {
          offset: 1,
          read: async () => bytes,
        },
        'a'.repeat(64),
      ),
    ).rejects.toMatchObject({ code: 'UPLOAD_OFFSET_CONFLICT' });
    await expect(
      service.advance(
        uploadId,
        actor,
        'signature',
        {
          offset: 0,
          read: async () => new Uint8Array(bytes.length),
        },
        'a'.repeat(64),
      ),
    ).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(
      f.sqlite.prepare('SELECT lease FROM qc_drive_upload').get()?.lease,
    ).toBeNull();
  });
  it('does not trust a missing provider checksum or advance failed bytes', async () => {
    mocks.send.mockRejectedValue(
      new DriveError('DRIVE_CHECKSUM_PENDING', 'pending', 409, true),
    );
    await expect(advance()).rejects.toMatchObject({
      code: 'DRIVE_CHECKSUM_PENDING',
    });
    expect(
      f.sqlite.prepare('SELECT status,sha256 FROM source_file_version').get(),
    ).toMatchObject({ status: 'upload_pending', sha256: null });
    expect(
      f.sqlite
        .prepare('SELECT acknowledged_bytes,lease FROM qc_drive_upload')
        .get(),
    ).toMatchObject({ acknowledged_bytes: 0, lease: null });
  });
  it('does not finalize if membership revoked during provider I/O', async () => {
    mocks.send.mockImplementation(async () => {
      f.sqlite.exec('DELETE FROM project_member');
      return done;
    });
    await expect(advance()).rejects.toThrow('권한');
    expect(
      f.sqlite.prepare('SELECT status FROM source_file_version').get()?.status,
    ).toBe('upload_pending');
  });
  it('does not resurrect rejected source versions', async () => {
    f.sqlite.exec("UPDATE source_file_version SET status='rejected'");
    await expect(advance()).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('prevents legacy upload claim once a resumable stage exists', async () => {
    await expect(
      new D1SourcePackageRepository().claim(uploadId, actor, 'legacy'),
    ).rejects.toThrow();
  });
  it('guards finalization against revocation between recheck and SQL batch', async () => {
    const batch = f.db.batch.bind(f.db);
    vi.spyOn(f.db, 'batch').mockImplementation(async (statements) => {
      f.sqlite.exec('DELETE FROM project_member');
      return batch(statements);
    });
    await expect(advance()).rejects.toThrow();
    expect(
      f.sqlite.prepare('SELECT status FROM source_file_version').get()?.status,
    ).toBe('upload_pending');
    expect(
      f.sqlite.prepare('SELECT state FROM qc_drive_upload').get()?.state,
    ).toBe('uploading');
  });
});
