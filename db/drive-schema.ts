import {
  check,
  foreignKey,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { projects, reviewCases, userProfiles } from './schema';

export const driveSettings = sqliteTable('qc_drive_settings', {
  id: integer('id').primaryKey(),
  clientId: text('client_id').notNull(),
  encryptedSecret: text('encrypted_secret').notNull(),
  targetEmail: text('target_email').notNull(),
  activeConnection: text('active_connection'),
  version: integer('version').notNull(),
});
export const driveConnection = sqliteTable('qc_drive_connection', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  clientId: text('client_id').notNull(),
  encryptedSecret: text('encrypted_secret').notNull(),
  encryptedRefresh: text('encrypted_refresh').notNull(),
  folderId: text('folder_id').notNull(),
  state: text('state', { enum: ['preparing', 'ready'] }).notNull(),
  createdAt: text('created_at').notNull(),
});
export const driveOAuthState = sqliteTable('qc_drive_oauth_state', {
  stateHash: text('state_hash').primaryKey(),
  actorId: text('actor_id').notNull(),
  version: integer('version').notNull(),
  encryptedVerifier: text('encrypted_verifier').notNull(),
  expiresAt: text('expires_at').notNull(),
});
export const driveObject = sqliteTable('qc_drive_object', {
  key: text('object_key').primaryKey(),
  connectionId: text('connection_id')
    .notNull()
    .references(() => driveConnection.id),
  fileId: text('file_id').notNull().unique(),
  sha256: text('sha256').notNull(),
  size: integer('size').notNull(),
  contentType: text('content_type').notNull(),
  state: text('state', { enum: ['reserved', 'stored', 'deleted'] }).notNull(),
});
export const driveAudit = sqliteTable('qc_drive_audit', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  connectionId: text('connection_id'),
  createdAt: text('created_at').notNull(),
});

// Staging only: provider-confirmed registration is not parser approval.
export const driveUpload = sqliteTable(
  'qc_drive_upload',
  {
    uploadId: text('upload_id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => driveConnection.id),
    fileId: text('file_id').notNull().unique(),
    expectedSha256: text('expected_sha256').notNull(),
    encryptedSession: text('encrypted_session'),
    offset: integer('acknowledged_bytes').notNull().default(0),
    lease: text('lease'),
    leaseExpiresAt: integer('lease_expires_at').notNull().default(0),
    sha256: text('sha256'),
    state: text('state', { enum: ['uploading', 'uploaded'] }).notNull(),
  },
  (table) => [
    check('drive_upload_offset', sql`${table.offset} >= 0`),
    check(
      'drive_upload_hash',
      sql`length(${table.expectedSha256})=64 AND ${table.expectedSha256} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      'drive_upload_state',
      sql`${table.state} IN ('uploading','uploaded')`,
    ),
    check(
      'drive_upload_complete_hash',
      sql`${table.state} <> 'uploaded' OR (length(${table.sha256})=64 AND ${table.sha256} NOT GLOB '*[^0-9a-f]*' AND ${table.sha256} IS NOT NULL)`,
    ),
  ],
);

export const drawingAttachment = sqliteTable(
  'qc_drawing_attachment',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    reviewCaseId: text('review_case_id').notNull(),
    filename: text('filename').notNull(),
    extension: text('extension', { enum: ['pdf', 'dwg', 'dxf'] }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: text('status', { enum: ['upload_pending', 'uploaded'] })
      .notNull()
      .default('upload_pending'),
    sha256: text('sha256'),
    createdBy: text('created_by')
      .notNull()
      .references(() => userProfiles.id),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.reviewCaseId, table.projectId],
      foreignColumns: [reviewCases.id, reviewCases.projectId],
    }),
    uniqueIndex('drawing_actor_idempotency').on(
      table.projectId,
      table.reviewCaseId,
      table.createdBy,
      table.idempotencyKey,
    ),
    check('drawing_size', sql`${table.sizeBytes} BETWEEN 1 AND 209715200`),
    check('drawing_extension', sql`${table.extension} IN ('pdf','dwg','dxf')`),
    check(
      'drawing_status',
      sql`${table.status} IN ('upload_pending','uploaded')`,
    ),
  ],
);
