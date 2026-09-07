import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { userProfiles } from './schema';
// Migration 0007 also applies exact-identity and administrator SQL guards.
export const employeeAccounts = sqliteTable('employee_account', {
  id: text('id')
    .primaryKey()
    .references(() => userProfiles.id),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  active: integer('active').notNull().default(1),
  credentialVersion: integer('credential_version').notNull().default(1),
  createdAt: integer('created_at').notNull(),
});
export const employeeSessions = sqliteTable(
  'employee_session',
  {
    tokenHash: text('token_hash').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => employeeAccounts.id),
    credentialVersion: integer('credential_version').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('employee_session_expiry').on(t.expiresAt)],
);
export const authAttempts = sqliteTable('auth_attempt', {
  bucket: text('bucket').primaryKey(),
  attempts: integer('attempts').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
export const authEvents = sqliteTable('auth_event', {
  id: text('id').primaryKey(),
  actorId: text('actor_id'),
  outcome: text('outcome').notNull(),
  requestId: text('request_id').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const rosterImports = sqliteTable('employee_roster_import', {
  revision: text('revision').primaryKey(),
  accountCount: integer('account_count').notNull(),
  createdAt: integer('created_at').notNull(),
});
