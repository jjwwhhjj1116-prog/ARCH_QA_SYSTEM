import type { Actor } from '@/lib/domain/contracts';
import { rolesForAction } from '@/lib/domain/permissions';
import { sourceObjectKey } from '@/lib/files/storage';
import { driveHash } from '@/lib/files/drive-storage';
import {
  connectionToken,
  type DriveConnection,
} from '@/lib/files/drive-settings';
import { driveFiles, DriveError } from '@/lib/files/google-drive';
import {
  driveTransfer,
  DRIVE_TRANSFER_CHUNK_BYTES,
  type DriveTransferProgress,
} from '@/lib/files/drive-transfer';
import { decryptKey, encryptKey } from '@/lib/server/ai/personal-settings';
import { SourcePackageAccessError, SourceUploadStateError } from './repository';
import { checkTransferSignature } from './transfer-signature';
import { downloadOriginal } from '@/lib/http/download-original';
import {
  MAX_SOURCE_BYTES,
  inspectSourceFile,
} from '@/lib/imports/inspect-source-file';

type Scope = {
  id: string;
  project_id: string;
  review_case_id: string;
  package_id: string;
  source_file_id: string;
  source_version_id: string;
  r2_object_key: string;
  extension_claimed: 'xlsx' | 'csv' | 'pdf' | 'dwg' | 'dxf';
  expected_size: number;
  expires_at: number;
  updated_at: number;
  source_status: string;
  state: string;
  purpose: string;
  sha256: string | null;
  filename: string;
  kind: 'source' | 'attachment';
};
type Stage = {
  upload_id: string;
  connection_id: string;
  file_id: string;
  encrypted_session: string | null;
  acknowledged_bytes: number;
  lease: string | null;
  lease_expires_at: number;
  state: 'uploading' | 'uploaded';
  sha256: string | null;
  expected_sha256: string;
};
const roles = rolesForAction('source:upload');
const placeholders = roles.map(() => '?').join(',');
const access = `WITH candidates AS (SELECT ua.id, ua.project_id, ua.review_case_id, ua.package_id,
  sf.id AS source_file_id, v.id AS source_version_id, ua.r2_object_key,
  v.extension_claimed, ua.expected_size, ua.expires_at, ua.updated_at, v.status AS source_status,
  ua.state, sf.purpose, v.sha256, v.original_filename AS filename, 'source' AS kind
  FROM upload_attempt ua
  JOIN source_file_version v ON v.id=ua.source_file_version_id
  JOIN source_file sf ON sf.id=v.source_file_id
  JOIN source_package sp ON sp.id=ua.package_id
  WHERE sf.status='active'
  AND sp.status NOT IN ('blocked','rejected','aborted')
  AND v.status IN ('upload_pending','uploaded','stored')
  AND v.project_id=ua.project_id AND v.review_case_id=ua.review_case_id AND v.package_id=sp.id
  AND NOT EXISTS (SELECT 1 FROM source_package replacement, json_each(replacement.replacement_targets_json) target
    WHERE replacement.project_id=sp.project_id AND replacement.review_case_id=sp.review_case_id
    AND replacement.replacement_applied_at IS NOT NULL AND json_extract(target.value,'$.id')=sp.id)
  UNION ALL
  SELECT a.id,a.project_id,a.review_case_id,NULL,a.id,a.id,
    'projects/'||a.project_id||'/cases/'||a.review_case_id||'/sources/'||a.id||'/files/'||a.id||'.'||a.extension,
    a.extension,a.size_bytes,a.expires_at,a.created_at,a.status,'created','attachment',a.sha256,a.filename,'attachment'
  FROM qc_drawing_attachment a)
  SELECT c.* FROM candidates c
  JOIN project p ON p.id=c.project_id
  JOIN review_case rc ON rc.id=c.review_case_id AND rc.project_id=c.project_id
  JOIN project_member pm ON pm.project_id=c.project_id
  WHERE c.id=? AND pm.user_id=? AND pm.role IN (${placeholders})
  AND p.status='active' AND rc.status<>'archived'`;

export class DriveTransferService {
  constructor(
    private db: D1Database,
    private secret: string | undefined,
    private fetcher = fetch,
  ) {}

  private async scope(id: string, actor: Actor, readOnly = false) {
    const sql = readOnly
      ? access.replace(` AND pm.role IN (${placeholders})`, '')
      : access;
    const scope = await this.db
      .prepare(sql)
      .bind(id, actor.id, ...(readOnly ? [] : roles))
      .first<Scope>();
    if (!scope)
      throw new SourcePackageAccessError(
        '이 프로젝트에 자료를 등록할 권한이 없습니다.',
      );
    if (
      scope.r2_object_key !==
      sourceObjectKey({
        projectId: scope.project_id,
        caseId: scope.review_case_id,
        sourceVersionId: scope.source_version_id,
        fileId: scope.source_file_id,
        extension: scope.extension_claimed,
      })
    )
      throw new SourceUploadStateError('원본 저장 계보를 확인할 수 없습니다.');
    if (
      !['stored', 'uploaded'].includes(scope.source_status) &&
      scope.expires_at <= Date.now()
    )
      throw new DriveError(
        'UPLOAD_EXPIRED',
        '등록 유효시간이 지났습니다. 새 자료 등록을 시작해 주세요.',
        409,
      );
    return scope;
  }

  private row(id: string) {
    return this.db
      .prepare('SELECT * FROM qc_drive_upload WHERE upload_id=?')
      .bind(id)
      .first<Stage>();
  }

  private summary(scope: Scope, stage: Stage | null) {
    const completed =
      scope.source_status === 'stored' || stage?.state === 'uploaded';
    return {
      uploadId: scope.id,
      sizeBytes: scope.expected_size,
      chunkBytes: DRIVE_TRANSFER_CHUNK_BYTES,
      offset: completed
        ? scope.expected_size
        : (stage?.acknowledged_bytes ?? 0),
      status: completed ? ('uploaded' as const) : ('uploading' as const),
      ...(completed ? { sha256: scope.sha256 ?? stage?.sha256 } : {}),
    };
  }

  async status(id: string, actor: Actor) {
    const scope = await this.scope(id, actor);
    return this.summary(scope, await this.row(id));
  }

  /** Run only in the bounded compute runtime, never as part of byte registration. */
  async prepare(id: string, actor: Actor, requestId: string) {
    const initial = await this.scope(id, actor);
    if (initial.kind !== 'source' || initial.purpose === 'attachment')
      throw new SourceUploadStateError('검사할 산출서가 아닙니다.');
    if (initial.source_status === 'stored' && initial.state === 'finalized')
      return { sourceVersionId: initial.source_version_id, prepared: true };
    // A failed inspection may retry under the same outer request ID.
    const original = await this.readForInspection(
      id,
      actor,
      crypto.randomUUID(),
    );
    const inspection = await inspectSourceFile({
      filename: original.filename,
      contentType: original.contentType,
      body: original.body,
    });
    if (inspection.sha256 !== original.sha256)
      throw new SourceUploadStateError(
        '검사 원본의 무결성이 일치하지 않습니다.',
      );
    const scope = await this.scope(id, actor);
    const stage = await this.row(id);
    if (
      !stage ||
      scope.source_version_id !== original.sourceVersionId ||
      stage.file_id !== original.driveFileId ||
      stage.connection_id !== original.driveConnectionId
    )
      throw new SourceUploadStateError('등록 원본이 변경되었습니다.');
    const marker = crypto.randomUUID();
    const now = Date.now();
    // All writes below depend on this transaction's authorized, immutable snapshot marker.
    const guard = `EXISTS(SELECT 1 FROM audit_event WHERE id=?)`;
    const contentType = inspection.detectedContentType.split(';')[0];
    const results = await this.db.batch([
      this.db
        .prepare(`INSERT INTO audit_event(id,project_id,actor_id,action,target_type,target_id,payload_json,request_id,created_at)
        SELECT ?,?,?, 'source_file.inspected','source_file_version',?,?,?,?
        WHERE EXISTS(${access})
        AND EXISTS(SELECT 1 FROM upload_attempt ua JOIN source_file_version v ON v.id=ua.source_file_version_id
          JOIN qc_drive_upload d ON d.upload_id=ua.id JOIN qc_drive_connection c ON c.id=d.connection_id
          WHERE ua.id=? AND ua.state='uploaded' AND v.id=? AND v.status='uploaded'
          AND v.sha256=? AND v.size_bytes=? AND d.state='uploaded' AND d.sha256=v.sha256
          AND d.expected_sha256=v.sha256 AND d.acknowledged_bytes=v.size_bytes
          AND d.file_id=? AND d.connection_id=? AND c.state='ready')
        AND NOT EXISTS(SELECT 1 FROM qc_drive_object WHERE object_key=?)`)
        .bind(
          marker,
          scope.project_id,
          actor.id,
          original.sourceVersionId,
          JSON.stringify({
            sha256: inspection.sha256,
            sizeBytes: inspection.sizeBytes,
            warningCount: inspection.warnings.length,
            inspection: 'source-preflight-2026.09.01',
          }),
          requestId,
          now,
          id,
          actor.id,
          ...roles,
          id,
          original.sourceVersionId,
          original.sha256,
          inspection.sizeBytes,
          stage.file_id,
          stage.connection_id,
          scope.r2_object_key,
        ),
      this.db
        .prepare(`INSERT INTO qc_drive_object(object_key,connection_id,file_id,sha256,size,content_type,state)
        SELECT ?,?,?,?,?,?,'stored' WHERE ${guard}`)
        .bind(
          scope.r2_object_key,
          stage.connection_id,
          stage.file_id,
          inspection.sha256,
          inspection.sizeBytes,
          contentType,
          marker,
        ),
      this.db
        .prepare(`UPDATE source_file_version SET status='stored',extension_detected=?,content_type_detected=?,
        validation_summary_json=?,stored_at=? WHERE id=? AND ${guard}`)
        .bind(
          inspection.format,
          inspection.detectedContentType,
          JSON.stringify({
            version: 'source-preflight-2026.09.01',
            format: inspection.format,
            documentKind: inspection.documentKind,
            archiveEntryCount: inspection.archiveEntryCount,
            archiveUncompressedBytes: inspection.archiveUncompressedBytes,
            csvRowCount: inspection.csvRowCount,
            warnings: inspection.warnings,
          }),
          now,
          original.sourceVersionId,
          marker,
        ),
      this.db
        .prepare(`UPDATE upload_attempt SET state='finalized',error_code=NULL,version=version+1,
        updated_at=? WHERE id=? AND ${guard}`)
        .bind(now, id, marker),
      this.db
        .prepare(`UPDATE source_package SET status=CASE WHEN NOT EXISTS(
        SELECT 1 FROM source_file_version v WHERE v.package_id=source_package.id AND v.status<>'stored')
        THEN 'stored_unverified' ELSE 'receiving' END,version=version+1 WHERE id=? AND ${guard}`)
        .bind(scope.package_id, marker),
    ]);
    if (results[0].meta.changes !== 1) {
      const current = await this.scope(id, actor);
      if (current.source_status !== 'stored' || current.state !== 'finalized')
        throw new SourceUploadStateError(
          '권한 또는 원본 상태가 변경되었습니다. 다시 확인해 주세요.',
        );
    }
    return { sourceVersionId: original.sourceVersionId, prepared: true };
  }

  /** Server-owned input for inspection; does not promote registration to review-ready. */
  async readForInspection(id: string, actor: Actor, requestId: string) {
    const before = await this.scope(id, actor);
    if (
      before.kind !== 'source' ||
      before.purpose === 'attachment' ||
      !['xlsx', 'csv'].includes(before.extension_claimed) ||
      before.source_status !== 'uploaded' ||
      before.expected_size > MAX_SOURCE_BYTES ||
      !before.sha256
    )
      throw new SourceUploadStateError('검사할 등록 산출서가 아닙니다.');
    const stage = await this.row(id);
    if (
      !stage ||
      stage.state !== 'uploaded' ||
      stage.sha256 !== before.sha256 ||
      stage.expected_sha256 !== before.sha256 ||
      stage.acknowledged_bytes !== before.expected_size
    )
      throw new SourceUploadStateError(
        '등록 원본의 무결성 정보를 확인해 주세요.',
      );
    const blob = await downloadOriginal(
      id,
      before.expected_size,
      () => {},
      async (_url, init) =>
        this.original(
          id,
          actor,
          requestId,
          new Headers(init?.headers).get('range'),
        ),
      before.sha256,
    );
    const body = new Uint8Array(await blob.arrayBuffer());
    // Check again after the complete read/hash; deletion, replacement or revocation wins.
    const after = await this.scope(id, actor);
    const current = await this.row(id);
    if (
      after.source_status !== 'uploaded' ||
      after.sha256 !== before.sha256 ||
      after.source_version_id !== before.source_version_id ||
      after.source_file_id !== before.source_file_id ||
      after.extension_claimed !== before.extension_claimed ||
      after.expected_size !== before.expected_size ||
      current?.state !== 'uploaded' ||
      current.sha256 !== before.sha256 ||
      current.expected_sha256 !== before.sha256 ||
      current.acknowledged_bytes !== before.expected_size ||
      current.file_id !== stage.file_id ||
      current.connection_id !== stage.connection_id
    )
      throw new SourceUploadStateError(
        '등록 상태가 변경되었습니다. 다시 확인해 주세요.',
      );
    return {
      body,
      filename: before.filename,
      format: before.extension_claimed as 'xlsx' | 'csv',
      contentType: transferContentType(before.extension_claimed),
      projectId: before.project_id,
      caseId: before.review_case_id,
      sourceVersionId: before.source_version_id,
      sourceFileId: before.source_file_id,
      sha256: before.sha256,
      driveFileId: stage.file_id,
      driveConnectionId: stage.connection_id,
    };
  }

  async original(
    id: string,
    actor: Actor,
    requestId = crypto.randomUUID(),
    range?: string | null,
  ): Promise<Response> {
    const scope = await this.scope(id, actor, true);
    let start = 0;
    let end = scope.expected_size - 1;
    if (range !== undefined && range !== null) {
      const match = /^bytes=(0|[1-9]\d*)-(0|[1-9]\d*)$/u.exec(range);
      start = match ? Number(match[1]) : NaN;
      end = match ? Number(match[2]) : NaN;
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      end >= scope.expected_size ||
      end - start + 1 > DRIVE_TRANSFER_CHUNK_BYTES
    )
      throw new DriveError(
        'DOWNLOAD_RANGE_REQUIRED',
        '원본은 1MiB 이하의 단일 범위로 내려받아 주세요.',
        416,
      );
    const partial = range !== undefined && range !== null;
    const size = end - start + 1;
    const contentRange = `bytes ${start}-${end}/${scope.expected_size}`;
    const stage = await this.row(id);
    if (!stage || stage.state !== 'uploaded' || !stage.sha256)
      throw new DriveError(
        'FILE_NOT_REGISTERED',
        '원본 저장이 아직 완료되지 않았습니다.',
        409,
      );
    const connection = await this.db
      .prepare("SELECT * FROM qc_drive_connection WHERE id=? AND state='ready'")
      .bind(stage.connection_id)
      .first<DriveConnection>();
    if (!connection)
      throw new DriveError(
        'DRIVE_RECONNECT_REQUIRED',
        '저장된 Drive 연결을 확인해 주세요.',
        409,
      );
    const token = await connectionToken(connection, this.secret, this.fetcher);
    const metadata = await driveTransfer(this.fetcher, token).metadata({
      id: stage.file_id,
      connectionId: connection.id,
      folderId: connection.folder_id,
      keyHash: await driveHash(new TextEncoder().encode(scope.r2_object_key)),
      size: scope.expected_size,
      contentType: transferContentType(scope.extension_claimed),
    });
    if (metadata.sha256 !== stage.sha256)
      throw new DriveError(
        'FILE_INTEGRITY_MISMATCH',
        'Drive 원본이 등록 당시와 다릅니다.',
        409,
      );
    await this.scope(id, actor, true);
    // Provider IDs have already been validated by metadata(); no arbitrary URL or redirect.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let response: Response | undefined;
    const body = new Uint8Array(size);
    try {
      // workerd's native fetch rejects a class instance as its receiver.
      const fetcher = this.fetcher;
      response = await fetcher(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(stage.file_id)}?alt=media`,
        {
          headers: {
            authorization: `Bearer ${token}`,
            ...(partial ? { Range: `bytes=${start}-${end}` } : {}),
          },
          redirect: 'manual',
          signal: controller.signal,
        },
      );
      if (
        response.status !== (partial ? 206 : 200) ||
        !response.body ||
        (partial && response.headers.get('content-range') !== contentRange) ||
        (response.headers.has('content-length') &&
          Number(response.headers.get('content-length')) !== size)
      ) {
        await response.body?.cancel();
        throw new DriveError(
          'DRIVE_DOWNLOAD_FAILED',
          '원본 다운로드를 시작하지 못했습니다. 다시 시도해 주세요.',
          502,
        );
      }
      const reader = response.body.getReader();
      let received = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (received + value.byteLength > size)
            throw new DriveError(
              'DRIVE_DOWNLOAD_FAILED',
              '원본 전송 크기가 다릅니다.',
              502,
            );
          body.set(value, received);
          received += value.byteLength;
        }
        if (received !== size)
          throw new DriveError(
            'DRIVE_DOWNLOAD_FAILED',
            '원본 전송이 완료되지 않았습니다.',
            502,
          );
      } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
      } finally {
        reader.releaseLock();
      }
      await this.scope(id, actor, true);
      if (start === 0)
        await this.db
          .prepare(
            `INSERT INTO audit_event(id,project_id,actor_id,action,target_type,target_id,payload_json,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            crypto.randomUUID(),
            scope.project_id,
            actor.id,
            'original.download_started',
            scope.kind === 'attachment'
              ? 'drawing_attachment'
              : 'source_file_version',
            scope.source_version_id,
            JSON.stringify({ sizeBytes: scope.expected_size }),
            requestId,
            Date.now(),
          )
          .run();
    } catch (error) {
      await response?.body?.cancel().catch(() => undefined);
      if (
        error instanceof DriveError ||
        error instanceof SourcePackageAccessError
      )
        throw error;
      throw new DriveError(
        'DRIVE_DOWNLOAD_FAILED',
        '원본 다운로드가 중단되었습니다. 다시 시도해 주세요.',
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
    return new Response(body, {
      status: partial ? 206 : 200,
      headers: {
        'accept-ranges': 'bytes',
        'content-length': String(size),
        'x-original-sha256': stage.sha256,
        ...(partial ? { 'content-range': contentRange } : {}),
        'content-type': 'application/octet-stream',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-disposition': `attachment; filename="original.${scope.extension_claimed}"; filename*=UTF-8''${encodeURIComponent(scope.filename)}`,
      },
    });
  }

  // POST reconciles uncertain writes. PUT never trusts an offset supplied by a caller.
  async advance(
    id: string,
    actor: Actor,
    requestId: string,
    chunk?: {
      offset: number;
      read: (limit: number) => Promise<Uint8Array<ArrayBuffer>>;
    },
    expectedSha256?: string,
  ) {
    const scope = await this.scope(id, actor);
    if (!expectedSha256 || !/^[a-f0-9]{64}$/u.test(expectedSha256))
      throw new DriveError(
        'FILE_HASH_REQUIRED',
        '원본 파일 식별값이 필요합니다. 파일을 다시 선택해 주세요.',
        400,
      );
    let stage = await this.row(id);
    if (
      (stage && stage.expected_sha256 !== expectedSha256) ||
      (scope.sha256 && scope.sha256 !== expectedSha256)
    )
      throw new DriveError(
        'FILE_HASH_CONFLICT',
        '이전에 선택한 원본과 다른 파일입니다. 새 자료로 등록해 주세요.',
        409,
      );
    if (scope.source_status === 'stored' || stage?.state === 'uploaded')
      return this.summary(scope, stage);
    let initialToken:
      | { connection: DriveConnection; value: string }
      | undefined;
    if (!stage) {
      if (
        scope.state === 'uploading' &&
        scope.updated_at > Date.now() - 300_000
      )
        throw new SourceUploadStateError(
          '이 파일의 기존 저장 작업을 먼저 확인해 주세요. 잠시 후 이어 올려 주세요.',
        );
      const connection = await this.db
        .prepare(
          "SELECT c.* FROM qc_drive_connection c JOIN qc_drive_settings s ON s.active_connection=c.id WHERE s.id=1 AND c.state='ready'",
        )
        .first<DriveConnection>();
      if (!connection)
        throw new DriveError(
          'DRIVE_NOT_CONNECTED',
          '관리자 설정에서 회사 Google Drive를 연결해 주세요.',
          503,
        );
      const token = await connectionToken(
        connection,
        this.secret,
        this.fetcher,
      );
      initialToken = { connection, value: token };
      const fileId = await driveFiles(this.fetcher, token).allocateId();
      await this.db
        .prepare(
          "INSERT OR IGNORE INTO qc_drive_upload(upload_id,connection_id,file_id,expected_sha256,state) VALUES(?,?,?,?,'uploading')",
        )
        .bind(id, connection.id, fileId, expectedSha256)
        .run();
      stage = await this.row(id);
    }
    if (!stage)
      throw new SourceUploadStateError('등록 상태를 만들지 못했습니다.');
    if (stage.expected_sha256 !== expectedSha256)
      throw new DriveError(
        'FILE_HASH_CONFLICT',
        '다른 원본의 등록 요청이 먼저 시작되었습니다.',
        409,
      );
    const lease = crypto.randomUUID();
    const claimed = await this.db
      .prepare(
        "UPDATE qc_drive_upload SET lease=?,lease_expires_at=? WHERE upload_id=? AND state='uploading' AND lease_expires_at<?",
      )
      .bind(lease, Date.now() + 90_000, id, Date.now())
      .run();
    if (claimed.meta.changes !== 1)
      throw new SourceUploadStateError(
        '다른 창에서 전송 중입니다. 잠시 후 이어 올려 주세요.',
      );
    try {
      await this.scope(id, actor);
      stage = (await this.row(id))!;
      const connection = await this.db
        .prepare(
          "SELECT * FROM qc_drive_connection WHERE id=? AND state='ready'",
        )
        .bind(stage.connection_id)
        .first<DriveConnection>();
      if (!connection)
        throw new DriveError(
          'DRIVE_RECONNECT_REQUIRED',
          '이 파일을 저장하던 Drive 연결을 확인해 주세요.',
          409,
        );
      // Reuse only within this request, after the ready connection is reread.
      // A concurrent winner or credential rotation must obtain its own token.
      const token =
        initialToken &&
        initialToken.connection.id === connection.id &&
        initialToken.connection.client_id === connection.client_id &&
        initialToken.connection.encrypted_secret ===
          connection.encrypted_secret &&
        initialToken.connection.encrypted_refresh ===
          connection.encrypted_refresh
          ? initialToken.value
          : await connectionToken(connection, this.secret, this.fetcher);
      const provider = driveTransfer(this.fetcher, token);
      const object = {
        id: stage.file_id,
        folderId: connection.folder_id,
        connectionId: connection.id,
        keyHash: await driveHash(new TextEncoder().encode(scope.r2_object_key)),
        size: scope.expected_size,
        contentType: transferContentType(scope.extension_claimed),
      };
      let session: string;
      if (stage.encrypted_session)
        session = await decryptKey(
          stage.encrypted_session,
          `drive-upload:${id}`,
          this.secret,
        );
      else {
        // Stable provider ID prevents duplicate files if initialization was interrupted.
        try {
          const metadata = await provider.metadata(object);
          return await this.finish(scope, actor, requestId, lease, {
            complete: true,
            offset: object.size,
            metadata,
          });
        } catch (error) {
          if (
            !(error instanceof DriveError) ||
            error.code !== 'DRIVE_NOT_FOUND'
          )
            throw error;
        }
        session = await provider.begin(object);
        const encrypted = await encryptKey(
          session,
          `drive-upload:${id}`,
          this.secret,
        );
        await this.db
          .prepare(
            'UPDATE qc_drive_upload SET encrypted_session=? WHERE upload_id=? AND lease=?',
          )
          .bind(encrypted, id, lease)
          .run();
      }
      let progress: DriveTransferProgress;
      if (chunk) {
        if (
          !Number.isSafeInteger(chunk.offset) ||
          chunk.offset !== stage.acknowledged_bytes ||
          chunk.offset >= scope.expected_size
        )
          throw new DriveError(
            'UPLOAD_OFFSET_CONFLICT',
            '서버 전송 위치가 다릅니다. 이어 올리기를 다시 시작해 주세요.',
            409,
          );
        const size = Math.min(
          DRIVE_TRANSFER_CHUNK_BYTES,
          scope.expected_size - chunk.offset,
        );
        const bytes = await chunk.read(size);
        if (bytes.byteLength !== size)
          throw new DriveError(
            'FILE_SIZE_MISMATCH',
            '전송 조각의 크기가 다릅니다.',
            400,
          );
        if (chunk.offset === 0)
          checkTransferSignature(scope.extension_claimed, bytes);
        progress = await provider.send(object, session, chunk.offset, bytes);
      } else progress = await provider.probe(object, session);
      return await this.finish(scope, actor, requestId, lease, progress);
    } finally {
      await this.db
        .prepare(
          'UPDATE qc_drive_upload SET lease=NULL,lease_expires_at=0 WHERE upload_id=? AND lease=?',
        )
        .bind(id, lease)
        .run();
    }
  }

  private async finish(
    scope: Scope,
    actor: Actor,
    requestId: string,
    lease: string,
    progress: DriveTransferProgress,
  ) {
    // Reauthorize after provider I/O; an aborted/revoked upload never becomes usable.
    await this.scope(scope.id, actor);
    if (progress.complete) {
      if (
        progress.metadata.sha256 !==
          (await this.row(scope.id))?.expected_sha256 ||
        progress.metadata.size !== scope.expected_size
      )
        throw new DriveError(
          'FILE_INTEGRITY_MISMATCH',
          '저장된 원본의 무결성이 일치하지 않습니다. 새 자료로 등록해 주세요.',
          409,
        );
      const guard = `EXISTS(SELECT 1 FROM qc_drive_upload WHERE upload_id=? AND lease=? AND state='uploading') AND EXISTS(${access})`;
      const guardValues = [scope.id, lease, scope.id, actor.id, ...roles];
      const validation = JSON.stringify({
        version: 'drive-registration-v1',
        integrity: 'provider_sha256',
        inspection:
          scope.purpose === 'attachment'
            ? 'attachment_only'
            : 'inspection_pending',
        warnings: ['INSPECTION_PENDING'],
      });
      await this.db.batch([
        ...(scope.kind === 'attachment'
          ? [
              this.db
                .prepare(
                  `UPDATE qc_drawing_attachment SET status='uploaded',sha256=? WHERE id=? AND status='upload_pending' AND ${guard}`,
                )
                .bind(progress.metadata.sha256, scope.id, ...guardValues),
            ]
          : [
              this.db
                .prepare(
                  `UPDATE source_file_version SET status='uploaded',sha256=?,validation_summary_json=? WHERE id=? AND status IN ('upload_pending','uploaded') AND ${guard}`,
                )
                .bind(
                  progress.metadata.sha256,
                  validation,
                  scope.source_version_id,
                  ...guardValues,
                ),
              this.db
                .prepare(
                  `UPDATE upload_attempt SET state='uploaded',error_code=NULL,updated_at=?,version=version+1 WHERE id=? AND ${guard}`,
                )
                .bind(Date.now(), scope.id, ...guardValues),
            ]),
        this.db
          .prepare(`INSERT INTO audit_event(id,project_id,actor_id,action,target_type,target_id,payload_json,request_id,created_at)
          SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}`)
          .bind(
            crypto.randomUUID(),
            scope.project_id,
            actor.id,
            scope.kind === 'attachment'
              ? 'attachment.registered'
              : 'source_file.registered',
            scope.kind === 'attachment'
              ? 'drawing_attachment'
              : 'source_file_version',
            scope.source_version_id,
            JSON.stringify({
              sizeBytes: scope.expected_size,
              inspection:
                scope.kind === 'attachment' ? 'attachment_only' : 'pending',
            }),
            requestId,
            Date.now(),
            ...guardValues,
          ),
        this.db
          .prepare(`UPDATE qc_drive_upload SET state='uploaded',acknowledged_bytes=?,sha256=?,encrypted_session=NULL WHERE upload_id=? AND lease=? AND state='uploading' AND EXISTS(${access})
          AND EXISTS(SELECT 1 FROM ${scope.kind === 'attachment' ? 'qc_drawing_attachment' : 'source_file_version'} WHERE id=? AND status='uploaded' AND sha256=?)`)
          .bind(
            progress.offset,
            progress.metadata.sha256,
            scope.id,
            lease,
            scope.id,
            actor.id,
            ...roles,
            scope.source_version_id,
            progress.metadata.sha256,
          ),
      ]);
      if ((await this.row(scope.id))?.state !== 'uploaded')
        throw new SourceUploadStateError(
          '권한 또는 등록 상태가 변경되었습니다. 저장 결과를 다시 확인해 주세요.',
        );
    } else {
      await this.db
        .prepare(
          "UPDATE qc_drive_upload SET acknowledged_bytes=? WHERE upload_id=? AND lease=? AND state='uploading'",
        )
        .bind(progress.offset, scope.id, lease)
        .run();
    }
    return this.summary(scope, await this.row(scope.id));
  }
}

function transferContentType(extension: Scope['extension_claimed']) {
  return {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    pdf: 'application/pdf',
    dwg: 'application/acad',
    dxf: 'application/dxf',
  }[extension];
}
