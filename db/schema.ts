import {
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const userProfiles = sqliteTable(
  'user_profile',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('user_profile_email_uq').on(table.email)],
);

export const projects = sqliteTable(
  'project',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    clientName: text('client_name'),
    status: text('status', { enum: ['active', 'archived'] }).notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => userProfiles.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('project_code_uq').on(table.code)],
);

export const projectMembers = sqliteTable(
  'project_member',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.id),
    role: text('role', {
      enum: [
        'workspace_admin',
        'project_owner',
        'reviewer',
        'approver',
        'viewer',
      ],
    }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('project_member_project_user_uq').on(
      table.projectId,
      table.userId,
    ),
    index('project_member_user_idx').on(table.userId),
  ],
);

export const reviewCases = sqliteTable(
  'review_case',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    name: text('name').notNull(),
    discipline: text('discipline', { enum: ['FIN', 'RC'] }).notNull(),
    status: text('status', {
      enum: [
        'draft',
        'ready',
        'reviewing',
        'needs_attention',
        'awaiting_approval',
        'approved',
        'archived',
      ],
    }).notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => userProfiles.id),
    reviewerId: text('reviewer_id').references(() => userProfiles.id),
    approverId: text('approver_id').references(() => userProfiles.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('review_case_project_idx').on(table.projectId),
    uniqueIndex('review_case_id_project_uq').on(table.id, table.projectId),
  ],
);

export const auditEvents = sqliteTable(
  'audit_event',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    actorId: text('actor_id')
      .notNull()
      .references(() => userProfiles.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    payloadJson: text('payload_json').notNull(),
    requestId: text('request_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('audit_event_project_time_idx').on(table.projectId, table.createdAt),
    uniqueIndex('audit_event_request_uq').on(table.requestId),
  ],
);

export const sourcePackages = sqliteTable(
  'source_package',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    reviewCaseId: text('review_case_id').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status', {
      enum: [
        'draft',
        'receiving',
        'validating',
        'stored_unverified',
        'identity_matched',
        'blocked',
        'rejected',
        'aborted',
      ],
    }).notNull(),
    projectIdentityStatus: text('project_identity_status', {
      enum: ['pending', 'matched', 'unknown', 'conflict'],
    }).notNull(),
    hardRuleVersion: text('hard_rule_version').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    version: integer('version').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => userProfiles.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.reviewCaseId, table.projectId],
      foreignColumns: [reviewCases.id, reviewCases.projectId],
      name: 'source_package_case_project_fk',
    }),
    uniqueIndex('source_package_actor_idempotency_uq').on(
      table.projectId,
      table.reviewCaseId,
      table.createdBy,
      table.idempotencyKey,
    ),
    uniqueIndex('source_package_scope_uq').on(
      table.id,
      table.projectId,
      table.reviewCaseId,
    ),
    index('source_package_case_idx').on(table.reviewCaseId, table.createdAt),
  ],
);

export const sourceFiles = sqliteTable(
  'source_file',
  {
    id: text('id').primaryKey(),
    packageId: text('package_id')
      .notNull()
      .references(() => sourcePackages.id),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    reviewCaseId: text('review_case_id').notNull(),
    purpose: text('purpose', {
      enum: ['quantity_source', 'reference', 'attachment'],
    }).notNull(),
    declaredDocumentKind: text('declared_document_kind', {
      enum: ['takeoff', 'summary', 'unknown'],
    }).notNull(),
    displayName: text('display_name').notNull(),
    status: text('status', { enum: ['active', 'archived'] }).notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => userProfiles.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.reviewCaseId, table.projectId],
      foreignColumns: [reviewCases.id, reviewCases.projectId],
      name: 'source_file_case_project_fk',
    }),
    foreignKey({
      columns: [table.packageId, table.projectId, table.reviewCaseId],
      foreignColumns: [
        sourcePackages.id,
        sourcePackages.projectId,
        sourcePackages.reviewCaseId,
      ],
      name: 'source_file_package_scope_fk',
    }),
    uniqueIndex('source_file_scope_uq').on(
      table.id,
      table.packageId,
      table.projectId,
      table.reviewCaseId,
    ),
    index('source_file_package_idx').on(table.packageId, table.createdAt),
  ],
);

export const sourceFileVersions = sqliteTable(
  'source_file_version',
  {
    id: text('id').primaryKey(),
    sourceFileId: text('source_file_id')
      .notNull()
      .references(() => sourceFiles.id),
    packageId: text('package_id')
      .notNull()
      .references(() => sourcePackages.id),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    reviewCaseId: text('review_case_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    originalFilename: text('original_filename').notNull(),
    extensionClaimed: text('extension_claimed').notNull(),
    extensionDetected: text('extension_detected'),
    contentTypeClaimed: text('content_type_claimed').notNull(),
    contentTypeDetected: text('content_type_detected'),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256'),
    r2ObjectKey: text('r2_object_key').notNull(),
    status: text('status', {
      enum: [
        'upload_pending',
        'uploaded',
        'validating',
        'stored',
        'rejected',
        'deleted',
      ],
    }).notNull(),
    validationSummaryJson: text('validation_summary_json'),
    projectIdentityStatus: text('project_identity_status', {
      enum: ['pending', 'matched', 'unknown', 'conflict'],
    }).notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => userProfiles.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    storedAt: integer('stored_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    foreignKey({
      columns: [table.reviewCaseId, table.projectId],
      foreignColumns: [reviewCases.id, reviewCases.projectId],
      name: 'source_version_case_project_fk',
    }),
    foreignKey({
      columns: [
        table.sourceFileId,
        table.packageId,
        table.projectId,
        table.reviewCaseId,
      ],
      foreignColumns: [
        sourceFiles.id,
        sourceFiles.packageId,
        sourceFiles.projectId,
        sourceFiles.reviewCaseId,
      ],
      name: 'source_version_file_scope_fk',
    }),
    uniqueIndex('source_version_number_uq').on(
      table.sourceFileId,
      table.versionNumber,
    ),
    uniqueIndex('source_version_scope_uq').on(
      table.id,
      table.packageId,
      table.projectId,
      table.reviewCaseId,
    ),
    index('source_version_project_sha_idx').on(table.projectId, table.sha256),
  ],
);

export const uploadAttempts = sqliteTable(
  'upload_attempt',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    reviewCaseId: text('review_case_id').notNull(),
    packageId: text('package_id')
      .notNull()
      .references(() => sourcePackages.id),
    sourceFileVersionId: text('source_file_version_id')
      .notNull()
      .references(() => sourceFileVersions.id),
    createdBy: text('created_by')
      .notNull()
      .references(() => userProfiles.id),
    state: text('state', {
      enum: [
        'created',
        'uploading',
        'uploaded',
        'finalizing',
        'finalized',
        'failed',
        'expired',
      ],
    }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    r2ObjectKey: text('r2_object_key').notNull(),
    expectedSize: integer('expected_size').notNull(),
    errorCode: text('error_code'),
    correlationId: text('correlation_id').notNull(),
    version: integer('version').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.reviewCaseId, table.projectId],
      foreignColumns: [reviewCases.id, reviewCases.projectId],
      name: 'upload_attempt_case_project_fk',
    }),
    foreignKey({
      columns: [
        table.sourceFileVersionId,
        table.packageId,
        table.projectId,
        table.reviewCaseId,
      ],
      foreignColumns: [
        sourceFileVersions.id,
        sourceFileVersions.packageId,
        sourceFileVersions.projectId,
        sourceFileVersions.reviewCaseId,
      ],
      name: 'upload_attempt_source_scope_fk',
    }),
    uniqueIndex('upload_attempt_actor_idempotency_uq').on(
      table.projectId,
      table.createdBy,
      table.idempotencyKey,
    ),
    index('upload_attempt_expiry_idx').on(table.state, table.expiresAt),
  ],
);

export const importJobs = sqliteTable(
  'import_job',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    reviewCaseId: text('review_case_id').notNull(),
    packageId: text('package_id')
      .notNull()
      .references(() => sourcePackages.id),
    sourceFileVersionId: text('source_file_version_id')
      .notNull()
      .references(() => sourceFileVersions.id),
    parserName: text('parser_name').notNull(),
    parserVersion: text('parser_version').notNull(),
    hardRuleVersion: text('hard_rule_version').notNull(),
    state: text('state', {
      enum: [
        'queued',
        'inspecting',
        'needs_mapping',
        'blocked',
        'ready',
        'failed',
      ],
    }).notNull(),
    stage: text('stage').notNull(),
    progressCurrent: integer('progress_current').notNull(),
    progressTotal: integer('progress_total').notNull(),
    workLeaseToken: text('work_lease_token'),
    leaseExpiresAt: integer('lease_expires_at', { mode: 'timestamp_ms' }),
    version: integer('version').notNull(),
    errorCode: text('error_code'),
    correlationId: text('correlation_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    failedAt: integer('failed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    foreignKey({
      columns: [table.reviewCaseId, table.projectId],
      foreignColumns: [reviewCases.id, reviewCases.projectId],
      name: 'import_job_case_project_fk',
    }),
    foreignKey({
      columns: [
        table.sourceFileVersionId,
        table.packageId,
        table.projectId,
        table.reviewCaseId,
      ],
      foreignColumns: [
        sourceFileVersions.id,
        sourceFileVersions.packageId,
        sourceFileVersions.projectId,
        sourceFileVersions.reviewCaseId,
      ],
      name: 'import_job_source_scope_fk',
    }),
    uniqueIndex('import_job_source_version_uq').on(table.sourceFileVersionId),
    index('import_job_package_idx').on(table.packageId, table.createdAt),
  ],
);
