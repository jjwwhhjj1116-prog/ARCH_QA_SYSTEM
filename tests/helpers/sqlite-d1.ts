import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

export function sqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const name of readdirSync('drizzle')
    .filter((n) => n.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8'));
  function prepare(sql: string, args: unknown[] = []) {
    function result() {
      const results = sqlite.prepare(sql).all(...(args as never[]));
      const meta = sqlite
        .prepare(
          'SELECT changes() AS changes,last_insert_rowid() AS last_row_id',
        )
        .get();
      return { results, success: true, meta: { ...meta, duration: 0 } };
    }
    return {
      bind: (...values: unknown[]) => prepare(sql, values),
      first: async () => result().results[0] ?? null,
      all: async () => result(),
      run: async () => result(),
      raw: async () => result().results.map(Object.values),
    };
  }
  const db = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  return { sqlite, db, close: () => sqlite.close() };
}
