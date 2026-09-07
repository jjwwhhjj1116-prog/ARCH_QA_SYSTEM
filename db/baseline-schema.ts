import {
  sqliteTable,
  text,
  integer,
  index,
  unique,
  foreignKey,
} from 'drizzle-orm/sqlite-core';
import { projects, userProfiles, reviewCases } from './schema';
// Migration 0008 owns immutable snapshots, history and atomic membership guards.
const lineage = () => ({
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  caseId: text('case_id').notNull(),
  actorId: text('actor_id')
    .notNull()
    .references(() => userProfiles.id),
  createdAt: text('created_at').notNull(),
});
export const basicJobs = sqliteTable(
  'qc_basic_job',
  {
    ...lineage(),
    requestKey: text('request_key').notNull(),
    sourcesJson: text('sources_json').notNull(),
    mappingsJson: text('mappings_json').notNull(),
    policyJson: text('policy_json').notNull(),
    partsJson: text('parts_json').notNull().default('[]'),
    cursor: integer('cursor').notNull().default(0),
    version: integer('version').notNull().default(0),
    leaseToken: text('lease_token'),
    leaseUntil: integer('lease_until').notNull().default(0),
    state: text('state', {
      enum: ['running', 'completed', 'failed'],
    }).notNull(),
    error: text('error'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    unique().on(t.projectId, t.caseId, t.actorId, t.requestKey),
    index('qc_basic_job_case').on(t.projectId, t.caseId, t.actorId, t.state),
    foreignKey({
      columns: [t.caseId, t.projectId],
      foreignColumns: [reviewCases.id, reviewCases.projectId],
    }),
  ],
);
export const basicRuns = sqliteTable(
  'qc_basic_run',
  {
    ...lineage(),
    id: text('id')
      .primaryKey()
      .references(() => basicJobs.id),
    objectKey: text('object_key').notNull().unique(),
    sha256: text('sha256').notNull(),
    findingCount: integer('finding_count').notNull(),
    rowCount: integer('row_count').notNull(),
  },
  (t) => [
    unique().on(t.id, t.projectId),
    index('qc_basic_run_case').on(t.projectId, t.caseId, t.createdAt),
    foreignKey({
      columns: [t.caseId, t.projectId],
      foreignColumns: [reviewCases.id, reviewCases.projectId],
    }),
  ],
);
export const basicDecisions = sqliteTable(
  'qc_basic_decision',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    runId: text('run_id').notNull(),
    findingId: text('finding_id').notNull(),
    disposition: text('disposition', {
      enum: ['needs_fix', 'normal', 'hold'],
    }).notNull(),
    reason: text('reason').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => userProfiles.id),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.runId, t.projectId],
      foreignColumns: [basicRuns.id, basicRuns.projectId],
    }),
  ],
);
