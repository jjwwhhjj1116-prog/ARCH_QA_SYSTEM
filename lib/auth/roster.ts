import { z } from 'zod';
import { getD1Binding } from '@/db';
import { tokenHash } from './password';

const rosterSchema = z
  .array(
    z.object({
      id: z.uuid(),
      email: z.email().max(254),
      name: z.string().min(1).max(120),
      passwordHash: z
        .string()
        .regex(
          /^(?:pbkdf2-sha256\$600000|scrypt\$16384\$8\$5)\$[a-f0-9]{32}\$[a-f0-9]{64}$/,
        ),
    }),
  )
  .min(1)
  .max(100);

// Server secrets only. Never accept a roster or permission grant from an HTTP body.
export async function provisionConfiguredRoster() {
  const parts = [1, 2, 3, 4, 5, 6, 7, 8].map(
    (i) => process.env[`EMPLOYEE_ROSTER_${i}`] ?? '',
  );
  const text = parts.join('');
  if (!text) return;
  if (text.length > 32_000) throw new Error('EMPLOYEE_ROSTER_INVALID');
  const revision = await tokenHash(text);
  const db = getD1Binding();
  if (
    await db
      .prepare('SELECT revision FROM employee_roster_import WHERE revision=?')
      .bind(revision)
      .first()
  )
    return;
  const entries = rosterSchema.parse(JSON.parse(text));
  if (
    new Set(entries.map((e) => e.email.toLowerCase())).size !==
      entries.length ||
    new Set(entries.map((e) => e.id)).size !== entries.length
  )
    throw new Error('EMPLOYEE_ROSTER_DUPLICATE');
  const now = Date.now();
  // New identities only. A conflicting existing email aborts the entire batch;
  // it never merges an old ChatGPT identity or changes project memberships.
  await db.batch([
    ...entries.flatMap((e) => [
      db
        .prepare(
          'INSERT INTO user_profile(id,email,display_name,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',
        )
        .bind(e.id, e.email.toLowerCase(), e.name, now),
      db
        .prepare(
          'INSERT INTO employee_account(id,email,password_hash,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',
        )
        .bind(e.id, e.email.toLowerCase(), e.passwordHash, now),
    ]),
    db
      .prepare(
        'INSERT INTO employee_roster_import(revision,account_count,created_at) VALUES (?,?,?) ON CONFLICT(revision) DO NOTHING',
      )
      .bind(revision, entries.length, now),
  ]);
}
