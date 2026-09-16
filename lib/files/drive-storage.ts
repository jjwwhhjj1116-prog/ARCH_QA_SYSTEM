import { z } from 'zod';
import { connectionToken, type DriveConnection } from './drive-settings';
import { DriveError, driveFiles, type DriveObject } from './google-drive';
import {
  sourceObjectKey,
  SourceFileConflictError,
  type PrivateFileStorage,
  type PutSourceFile,
  type SourceFileLocator,
} from './storage';

type ObjectRow = {
  object_key: string;
  connection_id: string;
  file_id: string;
  sha256: string;
  size: number;
  content_type: string;
  state: string;
};
const logicalKey = z
  .string()
  .max(500)
  .regex(
    /^projects\/[a-f0-9-]{36}\/cases\/[a-f0-9-]{36}\/(?:sources|basic|reviews)\/[A-Za-z0-9/_.-]+$/u,
  )
  .refine((key) => !key.includes('..'));
export async function driveHash(bytes: Uint8Array<ArrayBuffer>) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export class DriveStorage implements PrivateFileStorage {
  constructor(
    private db: D1Database,
    private secret: string | undefined,
    private fetcher = fetch,
  ) {}
  private row(key: string) {
    return this.db
      .prepare('SELECT * FROM qc_drive_object WHERE object_key=?')
      .bind(logicalKey.parse(key))
      .first<ObjectRow>();
  }
  private async connection(id?: string) {
    const result = id
      ? await this.db
          .prepare(
            "SELECT * FROM qc_drive_connection WHERE id=? AND state='ready'",
          )
          .bind(id)
          .first<DriveConnection>()
      : await this.db
          .prepare(
            "SELECT c.* FROM qc_drive_connection c JOIN qc_drive_settings s ON s.active_connection=c.id WHERE s.id=1 AND c.state='ready'",
          )
          .first<DriveConnection>();
    if (!result)
      throw new DriveError(
        'DRIVE_NOT_CONNECTED',
        '관리자 설정에서 회사 Google Drive를 연결해 주세요.',
        503,
      );
    return result;
  }
  private async context(row: ObjectRow) {
    const connection = await this.connection(row.connection_id);
    const token = await connectionToken(connection, this.secret, this.fetcher);
    const object: DriveObject = {
      id: row.file_id,
      connectionId: connection.id,
      folderId: connection.folder_id,
      keyHash: await driveHash(new TextEncoder().encode(row.object_key)),
      sha256: row.sha256,
      size: row.size,
      contentType: row.content_type,
    };
    return { files: driveFiles(this.fetcher, token), object };
  }
  async put(key: string, input: Uint8Array<ArrayBuffer>, contentType: string) {
    logicalKey.parse(key);
    const bytes = new Uint8Array(input);
    if (bytes.byteLength < 1 || bytes.byteLength > 32 * 1024 * 1024)
      throw new DriveError(
        'DRIVE_SIZE_LIMIT',
        '파일 저장 한도를 넘었습니다.',
        413,
      );
    // Drive mimeType is a media type, not an HTTP Content-Type header.
    // Keep source bytes unchanged; only omit the inspector's UTF-8 parameter.
    contentType = z
      .string()
      .regex(/^[\w.+-]+\/[\w.+-]+(?:; charset=utf-8)?$/u)
      .max(120)
      .parse(contentType)
      .split(';')[0];
    const sha256 = await driveHash(bytes);
    let row = await this.row(key);
    if (!row) {
      const connection = await this.connection();
      const token = await connectionToken(
        connection,
        this.secret,
        this.fetcher,
      );
      const fileId = await driveFiles(this.fetcher, token).allocateId();
      await this.db
        .prepare(
          "INSERT INTO qc_drive_object(object_key,connection_id,file_id,sha256,size,content_type,state) VALUES(?,?,?,?,?,?,'reserved') ON CONFLICT(object_key) DO NOTHING",
        )
        .bind(key, connection.id, fileId, sha256, bytes.byteLength, contentType)
        .run();
      row = await this.row(key);
    }
    if (
      !row ||
      row.state === 'deleted' ||
      row.sha256 !== sha256 ||
      row.size !== bytes.byteLength ||
      row.content_type !== contentType
    )
      throw new SourceFileConflictError(
        '기존 또는 삭제된 원본을 덮어쓸 수 없습니다. 수정본으로 다시 등록해 주세요.',
      );
    const { files, object } = await this.context(row);
    try {
      await files.verify(object);
    } catch (error) {
      // A stored object disappearing is not permission to resurrect it.
      if (
        !(error instanceof DriveError) ||
        error.code !== 'DRIVE_NOT_FOUND' ||
        row.state !== 'reserved'
      )
        throw error;
      try {
        await files.upload(object, bytes);
      } catch (writeError) {
        if (!(writeError instanceof DriveError) || !writeError.uncertain)
          throw writeError;
        // Same reserved ID only. No blind create, no automatic overwrite.
        await files.verify(object);
      }
    }
    const updated = await this.db
      .prepare(
        "UPDATE qc_drive_object SET state='stored' WHERE object_key=? AND state IN ('reserved','stored')",
      )
      .bind(key)
      .run();
    if (updated.meta.changes !== 1)
      throw new SourceFileConflictError(
        '파일 상태가 변경되어 저장을 완료하지 않았습니다.',
      );
    return { sha256, size: bytes.byteLength };
  }
  async get(key: string) {
    const row = await this.row(key);
    if (!row || row.state !== 'stored') return null;
    const { files, object } = await this.context(row);
    const bytes = await files.download(object);
    return {
      size: row.size,
      sha256: row.sha256,
      contentType: row.content_type,
      body: bytes.buffer,
      arrayBuffer: async () => bytes.buffer,
      text: async () => new TextDecoder().decode(bytes),
    };
  }
  async putSourceFile(input: PutSourceFile) {
    const bytes =
      input.body instanceof ArrayBuffer
        ? new Uint8Array(input.body.slice(0))
        : new Uint8Array(
            new Uint8Array(
              input.body.buffer,
              input.body.byteOffset,
              input.body.byteLength,
            ),
          );
    if (
      input.expectedSize !== undefined &&
      input.expectedSize !== bytes.byteLength
    )
      throw new SourceFileConflictError('파일 크기가 일치하지 않습니다.');
    if (
      input.expectedSha256 !== undefined &&
      input.expectedSha256.toLowerCase() !== (await driveHash(bytes))
    )
      throw new SourceFileConflictError('파일 해시가 일치하지 않습니다.');
    return this.put(sourceObjectKey(input), bytes, input.contentType);
  }
  getSourceFile(input: SourceFileLocator) {
    return this.get(sourceObjectKey(input));
  }
}
