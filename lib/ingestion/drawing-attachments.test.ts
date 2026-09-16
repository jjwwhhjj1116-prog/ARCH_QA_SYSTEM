// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Actor } from '@/lib/domain/contracts';
import { sqliteD1 } from '../../tests/helpers/sqlite-d1';
import { drawingAttachments } from './drawing-attachments';
import { SourcePackageAccessError } from './repository';

const actor: Actor = {
  id: 'employee',
  email: 'employee@example.test',
  displayName: 'Employee',
  source: 'development_mock',
};
const projectId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';
const otherProject = '33333333-3333-4333-8333-333333333333';
const otherCase = '44444444-4444-4444-8444-444444444444';
const input = {
  filename: '평면도.pdf',
  contentType: 'application/pdf',
  sizeBytes: 100,
};
const key = 'drawing-idempotency-123';
let f: ReturnType<typeof sqliteD1>;
const service = (identity = actor, project = projectId, reviewCase = caseId) =>
  drawingAttachments(f.db, project, reviewCase, identity);
const count = (table: 'qc_drawing_attachment' | 'audit_event') =>
  f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n;

beforeEach(() => {
  f = sqliteD1();
  f.sqlite
    .exec(`INSERT INTO user_profile VALUES ('employee','employee@example.test','Employee',1);
    INSERT INTO user_profile VALUES ('outsider','outsider@example.test','Outsider',1);
    INSERT INTO project VALUES ('${projectId}','TEST','Test',NULL,'active','employee',1);
    INSERT INTO project VALUES ('${otherProject}','OTHER','Other',NULL,'active','outsider',1);
    INSERT INTO project_member VALUES ('membership','${projectId}','employee','reviewer',1);
    INSERT INTO review_case VALUES ('${caseId}','${projectId}','FIN','FIN','draft','employee',NULL,NULL,1);
    INSERT INTO review_case VALUES ('${otherCase}','${otherProject}','FIN','FIN','draft','outsider',NULL,NULL,1);`);
});
afterEach(() => f.close());

it('allows project reviewers to create and list originals, without parser or review records', async () => {
  const created = await service().create(input, key, 'create');
  expect(created).toMatchObject({
    filename: input.filename,
    sizeBytes: 100,
    status: 'upload_pending',
  });
  expect(await service().list()).toEqual([created]);
  expect(count('audit_event')).toBe(1);
  expect(
    f.sqlite.prepare('SELECT COUNT(*) AS n FROM source_file_version').get()?.n,
  ).toBe(0);
  expect(
    f.sqlite.prepare('SELECT COUNT(*) AS n FROM import_job').get()?.n,
  ).toBe(0);
});

it('lets viewers read membership-scoped lists but denies creating an attachment', async () => {
  const created = await service().create(input, key, 'create');
  f.sqlite.exec("UPDATE project_member SET role='viewer'");
  expect(await service().list()).toEqual([created]);
  await expect(
    service().create(input, 'another-key-123', 'deny'),
  ).rejects.toBeInstanceOf(SourcePackageAccessError);
  expect(count('qc_drawing_attachment')).toBe(1);
  expect(count('audit_event')).toBe(1);
});

it('denies outsiders both reading and writing even if they know valid project and case IDs', async () => {
  await service().create(input, key, 'create');
  const outsider = service({ ...actor, id: 'outsider' });
  await expect(outsider.list()).rejects.toBeInstanceOf(
    SourcePackageAccessError,
  );
  await expect(outsider.create(input, key, 'deny')).rejects.toBeInstanceOf(
    SourcePackageAccessError,
  );
  expect(count('qc_drawing_attachment')).toBe(1);
});

it('rejects mismatched project/case pairs and archived scopes', async () => {
  await expect(
    service(actor, projectId, otherCase).list(),
  ).rejects.toBeInstanceOf(SourcePackageAccessError);
  await expect(
    service(actor, projectId, otherCase).create(input, key, 'deny'),
  ).rejects.toBeInstanceOf(SourcePackageAccessError);
  f.sqlite.exec("UPDATE review_case SET status='archived'");
  await expect(service().create(input, key, 'deny')).rejects.toBeInstanceOf(
    SourcePackageAccessError,
  );
  await expect(service().list()).rejects.toBeInstanceOf(
    SourcePackageAccessError,
  );
  expect(count('qc_drawing_attachment')).toBe(0);
});

it('same key and metadata return the same intent with one audit event', async () => {
  const first = await service().create(input, key, 'first');
  expect(await service().create(input, key, 'retry')).toEqual(first);
  expect(count('qc_drawing_attachment')).toBe(1);
  expect(count('audit_event')).toBe(1);
});

it.each([{ filename: '다른도면.pdf' }, { sizeBytes: 101 }])(
  'rejects metadata changes with reused key: %j',
  async (change) => {
    await service().create(input, key, 'first');
    await expect(
      service().create({ ...input, ...change }, key, 'conflict'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(count('qc_drawing_attachment')).toBe(1);
    expect(count('audit_event')).toBe(1);
  },
);

it.each([
  '../floor.pdf',
  'folder/floor.pdf',
  'folder\\floor.pdf',
  'bad\u0000.pdf',
  'drawing.xlsx',
  'drawing.pdf.exe',
  '',
  'x'.repeat(181),
])('rejects unsafe or unsupported filename %j', async (filename) => {
  await expect(
    service().create({ ...input, filename }, key, 'invalid'),
  ).rejects.toThrow();
  expect(count('qc_drawing_attachment')).toBe(0);
  expect(count('audit_event')).toBe(0);
});

it.each([0, -1, 1.5, 200 * 1024 * 1024 + 1])(
  'rejects invalid size %s before creating records',
  async (sizeBytes) => {
    await expect(
      service().create({ ...input, sizeBytes }, key, 'invalid'),
    ).rejects.toThrow();
    expect(count('qc_drawing_attachment')).toBe(0);
  },
);

it.each(['PDF', 'dwg', 'dxf'])(
  'accepts supported %s extension at 200MiB boundary',
  async (extension) => {
    expect(
      await service().create(
        {
          ...input,
          filename: `도면.${extension}`,
          sizeBytes: 200 * 1024 * 1024,
        },
        key,
        'boundary',
      ),
    ).toMatchObject({ sizeBytes: 209715200, status: 'upload_pending' });
  },
);

it('caps each case at 200 attachments, retaining idempotent retries at the cap', async () => {
  const first = await service().create(input, key, 'first');
  f.sqlite
    .prepare(`WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<199)
    INSERT INTO qc_drawing_attachment(id,project_id,review_case_id,filename,extension,size_bytes,created_by,created_at,expires_at,idempotency_key)
    SELECT 'seed-'||i,?,?,'seed-'||i||'.pdf','pdf',100,'employee',1,2,'seed-key-'||i FROM n`)
    .run(projectId, caseId);
  expect(count('qc_drawing_attachment')).toBe(200);
  expect(await service().create(input, key, 'retry')).toEqual(first);
  await expect(
    service().create(input, 'over-cap-key-123', 'over'),
  ).rejects.toMatchObject({ code: 'ATTACHMENT_LIMIT' });
  expect(count('qc_drawing_attachment')).toBe(200);
  expect(count('audit_event')).toBe(1);
  expect(await service().list()).toHaveLength(200);
});
