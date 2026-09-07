import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  foreignKey,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { projects, userProfiles, reviewCases } from './schema';

// SQL migration 0005 additionally installs immutable-history and atomic role/CAS guards.
const lineage = () => ({
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  actorId: text('actor_id')
    .notNull()
    .references(() => userProfiles.id),
  createdAt: text('created_at').notNull(),
});
export const qcProfiles = sqliteTable(
  'qc_profile_version',
  {
    ...lineage(),
    version: integer('version').notNull(),
    profileJson: text('profile_json').notNull(),
  },
  (t) => [
    uniqueIndex('qc_profile_project_version').on(t.projectId, t.version),
    uniqueIndex('qc_profile_scope').on(t.id, t.projectId),
  ],
);
export const qcMappings = sqliteTable(
  'qc_mapping_version',
  {
    ...lineage(),
    caseId: text('case_id').notNull(),
    mappingsJson: text('mappings_json').notNull(),
    baseId: text('base_id').notNull(),
  },
  (t) => [
    uniqueIndex('qc_mapping_base').on(t.projectId, t.caseId, t.baseId),
    index('qc_mapping_case').on(t.projectId, t.caseId, t.createdAt),
    foreignKey({
      columns: [t.caseId, t.projectId],
      foreignColumns: [reviewCases.id, reviewCases.projectId],
    }),
  ],
);
export const qcRuns = sqliteTable(
  'qc_review_run',
  {
    ...lineage(),
    caseId: text('case_id').notNull(),
    profileId: text('profile_id').notNull(),
    profileVersion: integer('profile_version').notNull(),
    trial: integer('trial').notNull(),
    objectKey: text('object_key').notNull().unique(),
    sha256: text('sha256').notNull(),
    findingCount: integer('finding_count').notNull(),
    rowCount: integer('row_count').notNull(),
  },
  (t) => [
    uniqueIndex('qc_run_scope').on(t.id, t.projectId),
    index('qc_run_case').on(t.projectId, t.caseId, t.createdAt),
    check('qc_trial_boolean', sql`${t.trial} IN (0,1)`),
    foreignKey({
      columns: [t.caseId, t.projectId],
      foreignColumns: [reviewCases.id, reviewCases.projectId],
    }),
    foreignKey({
      columns: [t.profileId, t.projectId],
      foreignColumns: [qcProfiles.id, qcProfiles.projectId],
    }),
  ],
);
export const qcApprovals = sqliteTable(
  'qc_profile_approval',
  {
    ...lineage(),
    profileId: text('profile_id').notNull().unique(),
    trialRunId: text('trial_run_id').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.profileId, t.projectId],
      foreignColumns: [qcProfiles.id, qcProfiles.projectId],
    }),
    foreignKey({
      columns: [t.trialRunId, t.projectId],
      foreignColumns: [qcRuns.id, qcRuns.projectId],
    }),
  ],
);
export const qcDecisions = sqliteTable(
  'qc_review_decision',
  {
    ...lineage(),
    runId: text('run_id').notNull(),
    findingId: text('finding_id').notNull(),
    disposition: text('disposition', {
      enum: ['needs_fix', 'normal', 'hold'],
    }).notNull(),
    reason: text('reason').notNull(),
  },
  (t) => [
    index('qc_decision_run').on(t.projectId, t.runId, t.createdAt),
    foreignKey({
      columns: [t.runId, t.projectId],
      foreignColumns: [qcRuns.id, qcRuns.projectId],
    }),
    check(
      'qc_disposition',
      sql`${t.disposition} IN ('needs_fix','normal','hold')`,
    ),
  ],
);
