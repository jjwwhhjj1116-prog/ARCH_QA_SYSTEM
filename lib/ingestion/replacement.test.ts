// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/lib/domain/contracts';
import { hasUsableStoredSources } from './document-checklist';
import { SourcePackageService } from './service';

const mock = vi.hoisted(() => ({ binding: undefined as unknown }));
vi.mock('@/db', () => ({ getD1Binding: () => mock.binding }));
const { D1SourcePackageRepository } = await import('./d1-repository');
let db: DatabaseSync;
let afterArchiveRead: (() => void) | undefined;
const actor: Actor = {
  id: 'owner',
  email: 'owner@example.test',
  displayName: 'Test',
  source: 'development_mock',
};
const projectId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';
const repository = new D1SourcePackageRepository();
const service = new SourcePackageService(repository);

class Statement {
  values: SQLInputValue[] = [];
  constructor(readonly sql: string) {}
  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }
  execute() {
    const statement = db.prepare(this.sql);
    if (this.sql.trimStart().startsWith('SELECT'))
      return { results: statement.all(...this.values), meta: { changes: 0 } };
    return {
      results: [],
      meta: { changes: Number(statement.run(...this.values).changes) },
    };
  }
  async first<T>() {
    const result =
      (db.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
    if (
      this.sql.includes('SELECT sp.status, sp.version, sp.created_by, pm.role')
    )
      afterArchiveRead?.();
    return result;
  }
  async run() {
    return this.execute();
  }
}

beforeEach(() => {
  afterArchiveRead = undefined;
  db = new DatabaseSync(':memory:');
  for (const file of [
    '0001_initial.sql',
    '0002_ingestion.sql',
    '0003_ingestion_case_idempotency.sql',
  ]) {
    db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
  db.exec(`INSERT INTO user_profile VALUES ('owner','owner@example.test','Test',1);
    INSERT INTO project VALUES ('${projectId}','TEST','Test',NULL,'active','owner',1);
    INSERT INTO project_member VALUES ('membership','${projectId}','owner','project_owner',1);
    INSERT INTO review_case VALUES ('${caseId}','${projectId}','FIN','FIN','draft','owner',NULL,NULL,1);`);
  // Upgrade an existing database, not just an empty schema.
  db.exec(readFileSync('drizzle/0004_source_package_replacement.sql', 'utf8'));
  db.exec(readFileSync('drizzle/0010_aspiring_rockslide.sql', 'utf8'));
  db.exec(readFileSync('drizzle/0011_drive_upload.sql', 'utf8'));
  mock.binding = {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      db.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.execute());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
});
afterEach(() => db.close());

async function create(
  replaces?: Array<{ id: string; version: number }>,
  fileCount = 1,
  key = crypto.randomUUID(),
) {
  return service.create(
    projectId,
    caseId,
    actor,
    {
      displayName: '합성 산출서',
      replaces,
      files: Array.from({ length: fileCount }, (_, i) => ({
        filename: `내부산출서${i}.csv`,
        contentType: 'text/csv',
        sizeBytes: 10,
        purpose: 'quantity_source' as const,
      })),
    },
    key,
    crypto.randomUUID(),
  );
}
function store(packageId: string, count = 99) {
  const versions = db
    .prepare('SELECT id FROM source_file_version WHERE package_id = ?')
    .all(packageId)
    .slice(0, count);
  for (const row of versions) {
    db.prepare(
      `UPDATE source_file_version SET status='stored', extension_detected='csv', content_type_detected='text/csv', sha256=?, validation_summary_json='{}', stored_at=1 WHERE id=?`,
    ).run('a'.repeat(64), row.id);
    db.prepare(
      "UPDATE upload_attempt SET state='finalized' WHERE source_file_version_id=?",
    ).run(row.id);
  }
  const pending = db
    .prepare(
      "SELECT COUNT(*) AS count FROM source_file_version WHERE package_id=? AND status<>'stored'",
    )
    .get(packageId)!;
  db.prepare(
    'UPDATE source_package SET status=?, version=version+1 WHERE id=?',
  ).run(pending.count === 0 ? 'stored_unverified' : 'receiving', packageId);
}
const list = () => repository.listForActor(projectId, caseId, actor.id);
async function apply(id: string) {
  const current = (await list()).find((item) => item.id === id)!;
  return repository.applyReplacement({
    projectId,
    reviewCaseId: caseId,
    packageId: id,
    expectedVersion: current.version,
    actor,
    requestId: crypto.randomUUID(),
    archivedAt: new Date(),
  });
}

describe('source replacement with real SQLite transactions', () => {
  it.each(['project', 'case'])(
    'explains archived %s without creating or changing records',
    async (target) => {
      const existing = await create();
      db.exec(
        `UPDATE ${target === 'project' ? 'project' : 'review_case'} SET status='archived'`,
      );
      const guidance =
        target === 'project' ? '보관된 프로젝트' : '보관된 자료 기록';
      await expect(create()).rejects.toThrow(guidance);
      await expect(list()).rejects.toThrow(guidance);
      expect(
        db.prepare('SELECT COUNT(*) AS n FROM source_package').get()?.n,
      ).toBe(1);
      expect(
        db
          .prepare('SELECT status FROM source_package WHERE id=?')
          .get(existing.id)?.status,
      ).toBe('receiving');
    },
  );

  it('does not disclose archived state to nonmembers or mismatched cases', async () => {
    db.exec("UPDATE project SET status='archived'");
    await expect(
      repository.listForActor(projectId, caseId, 'outsider'),
    ).rejects.toThrow('권한');
    await expect(
      repository.listForActor(projectId, crypto.randomUUID(), actor.id),
    ).rejects.toThrow('권한');
    db.exec('DELETE FROM project_member');
    await expect(create()).rejects.toThrow('권한');
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM source_package').get()?.n,
    ).toBe(0);
  });

  it.each(['viewer', 'approver'])(
    'allows %s listing but denies registration',
    async (role) => {
      db.prepare('UPDATE project_member SET role=?').run(role);
      await expect(list()).resolves.toEqual([]);
      await expect(create()).rejects.toThrow('권한');
      expect(
        db.prepare('SELECT COUNT(*) AS n FROM source_package').get()?.n,
      ).toBe(0);
    },
  );

  it.each(['project_owner', 'workspace_admin', 'reviewer'])(
    'retains active %s registration',
    async (role) => {
      db.prepare('UPDATE project_member SET role=?').run(role);
      const result = await create();
      expect((await list()).map((item) => item.id)).toEqual([result.id]);
    },
  );

  it('activates all new files once and keeps immutable originals as superseded history', async () => {
    const old = await create();
    store(old.id);
    const targets = (await list()).map(({ id, version }) => ({ id, version }));
    const next = await create(targets, 2);
    store(next.id);
    expect(
      (await list()).filter(hasUsableStoredSources).map((p) => p.id),
    ).toEqual([old.id]);
    await apply(next.id);
    await apply(next.id);
    const rows = await list();
    expect(rows.filter(hasUsableStoredSources).map((p) => p.id)).toEqual([
      next.id,
    ]);
    expect(rows.find((p) => p.id === old.id)?.supersededBy).toBe(next.id);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM source_file_version WHERE status='stored'",
        )
        .get()?.count,
    ).toBe(3);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_event WHERE action='source_package.replaced'",
        )
        .get()?.count,
    ).toBe(1);
    await expect(
      repository.claim(old.files[0].uploadId, actor, 'retry-old'),
    ).rejects.toMatchObject({ code: 'SOURCE_PACKAGE_ACCESS_DENIED' });
  });

  it('keeps old input unchanged when only one of two replacement files is stored', async () => {
    const old = await create();
    store(old.id);
    const next = await create(
      (await list()).map(({ id, version }) => ({ id, version })),
      2,
    );
    store(next.id, 1);
    await expect(apply(next.id)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(
      (await list()).filter(hasUsableStoredSources).map((p) => p.id),
    ).toEqual([old.id]);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_event WHERE action='source_package.replaced'",
        )
        .get()?.count,
    ).toBe(0);
  });

  it('changes no target when the last target version conflicts or an old upload is active', async () => {
    const first = await create();
    store(first.id);
    const last = await create();
    store(last.id);
    const next = await create(
      (await list()).map(({ id, version }) => ({ id, version })),
    );
    store(next.id);
    db.prepare('UPDATE source_package SET version=version+1 WHERE id=?').run(
      last.id,
    );
    await expect(apply(next.id)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect((await list()).filter(hasUsableStoredSources)).toHaveLength(2);
    db.prepare('UPDATE source_package SET version=version-1 WHERE id=?').run(
      last.id,
    );
    db.prepare(
      "UPDATE upload_attempt SET state='uploading' WHERE package_id=?",
    ).run(last.id);
    await expect(apply(next.id)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect((await list()).filter(hasUsableStoredSources)).toHaveLength(2);
  });

  it('allows one overlapping replacement, and replay never reactivates superseded input', async () => {
    const old = await create();
    store(old.id);
    const targets = (await list()).map(({ id, version }) => ({ id, version }));
    const a = await create(targets);
    const b = await create(targets);
    store(a.id);
    store(b.id);
    const results = await Promise.allSettled([apply(a.id), apply(b.id)]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const active = (await list()).filter(hasUsableStoredSources);
    expect(active).toHaveLength(1);
    const latest = await create(
      active.map(({ id, version }) => ({ id, version })),
    );
    store(latest.id);
    await apply(latest.id);
    await apply(active[0].id);
    expect(
      (await list()).filter(hasUsableStoredSources).map((p) => p.id),
    ).toEqual([latest.id]);
  });

  it('rejects wrong case, revoked role, and other authors for a reviewer', async () => {
    const old = await create();
    store(old.id);
    const next = await create(
      (await list()).map(({ id, version }) => ({ id, version })),
    );
    store(next.id);
    await expect(
      repository.applyReplacement({
        projectId,
        reviewCaseId: crypto.randomUUID(),
        packageId: next.id,
        expectedVersion: 2,
        actor,
        requestId: crypto.randomUUID(),
        archivedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_PACKAGE_ACCESS_DENIED' });
    db.exec("UPDATE project_member SET role='viewer'");
    await expect(apply(next.id)).rejects.toMatchObject({
      code: 'SOURCE_PACKAGE_ACCESS_DENIED',
    });
    db.exec(
      "UPDATE project_member SET role='reviewer'; INSERT INTO user_profile VALUES ('other','other@example.test','Other',1)",
    );
    db.prepare("UPDATE source_package SET created_by='other' WHERE id=?").run(
      old.id,
    );
    await expect(apply(next.id)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(
      (await list()).filter(hasUsableStoredSources).map((p) => p.id),
    ).toEqual([old.id]);
  });

  it('binds idempotency to replacement targets and preserves additive replay', async () => {
    const old = await create();
    store(old.id);
    const targets = (await list()).map(({ id, version }) => ({ id, version }));
    const key = crypto.randomUUID();
    const next = await create(targets, 1, key);
    expect((await create(targets, 1, key)).id).toBe(next.id);
    await expect(create(undefined, 1, key)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(
      create([{ ...targets[0], version: 999 }], 1, key),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('can cancel a fully stored pending replacement without changing the active original', async () => {
    const old = await create();
    store(old.id);
    const next = await create(
      (await list()).map(({ id, version }) => ({ id, version })),
    );
    store(next.id);
    const current = (await list()).find((item) => item.id === next.id)!;
    const record = {
      projectId,
      reviewCaseId: caseId,
      packageId: next.id,
      expectedVersion: current.version,
      actor,
      requestId: crypto.randomUUID(),
      archivedAt: new Date(),
    };
    db.exec("UPDATE project_member SET role='viewer'");
    await expect(repository.archive(record)).rejects.toMatchObject({
      code: 'SOURCE_PACKAGE_ACCESS_DENIED',
    });
    db.exec("UPDATE project_member SET role='project_owner'");
    await repository.archive(record);
    expect((await list()).map((p) => p.id)).toEqual([old.id]);
    expect(
      (await list()).filter(hasUsableStoredSources).map((p) => p.id),
    ).toEqual([old.id]);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM source_file_version WHERE status='stored'",
        )
        .get()?.count,
    ).toBe(2);
    await expect(repository.applyReplacement(record)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });

  it('rechecks cancellation authority inside the transaction after a concurrent role revocation', async () => {
    const old = await create();
    store(old.id);
    const next = await create(
      (await list()).map(({ id, version }) => ({ id, version })),
    );
    store(next.id);
    const current = (await list()).find((item) => item.id === next.id)!;
    afterArchiveRead = () => db.exec("UPDATE project_member SET role='viewer'");
    await expect(
      repository.archive({
        projectId,
        reviewCaseId: caseId,
        packageId: next.id,
        expectedVersion: current.version,
        actor,
        requestId: crypto.randomUUID(),
        archivedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(
      db.prepare('SELECT status FROM source_package WHERE id=?').get(next.id)
        ?.status,
    ).toBe('stored_unverified');
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_event WHERE action='source_package.aborted'",
        )
        .get()?.count,
    ).toBe(0);
    expect(
      (await list()).filter(hasUsableStoredSources).map((p) => p.id),
    ).toEqual([old.id]);
  });
});
