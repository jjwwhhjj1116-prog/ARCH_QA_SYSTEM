import {
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
  (table) => [index('review_case_project_idx').on(table.projectId)],
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
