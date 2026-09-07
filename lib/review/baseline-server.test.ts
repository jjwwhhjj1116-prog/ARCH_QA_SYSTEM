// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../../tests/helpers/sqlite-d1';
import { BaselineService, BASIC_POLICY } from './baseline-server';
import type { ReviewService } from './server';
import type { Mapping, ReviewSource } from './contracts';
import { parseCsv, suggestMapping } from './workbook';
import { RequestBoundaryError } from '../http/request-boundary';

const mock = vi.hoisted(() => ({
  db: null as D1Database | null,
  objects: new Map<string, string>(),
  onPut: null as (() => void) | null,
}));
vi.mock('@/db', () => ({ getD1Binding: () => mock.db }));
vi.mock('cloudflare:workers', () => ({
  env: {
    FILES: {
      put: async (key: string, text: string) => {
        mock.objects.set(key, text);
        mock.onPut?.();
      },
      get: async (key: string) => {
        const text = mock.objects.get(key);
        return text === undefined
          ? null
          : {
              size: new TextEncoder().encode(text).length,
              text: async () => text,
            };
      },
    },
  },
}));
let storage: ReturnType<typeof sqliteD1>;
let review: ReviewService;
let mappings: Mapping[];
let denied: boolean;
let mappingConflict: boolean;
const actor = {
  id: 'u',
  email: 'synthetic@example.invalid',
  displayName: 'Synthetic',
  source: 'employee' as const,
};
const source: ReviewSource = {
  sourceVersionId: '10000000-0000-4000-8000-000000000001',
  sourceFileId: 'f',
  filename: '내부산출서.csv',
  format: 'csv',
  packageId: 'pkg',
};
const sheet = parseCsv(
  '내부산출서\n부위,품명,규격,단위,산식,물량\n벽,도장,T10,㎡,H*10,100',
);
beforeEach(() => {
  storage = sqliteD1();
  mock.db = storage.db;
  mock.objects.clear();
  mock.onPut = null;
  storage.sqlite.exec(
    "INSERT INTO user_profile VALUES ('u','synthetic@example.invalid','Synthetic',0); INSERT INTO project VALUES ('p','P','Synthetic',NULL,'active','u',0); INSERT INTO project_member VALUES ('m','p','u','project_owner',0); INSERT INTO review_case VALUES ('c','p','Synthetic','FIN','draft','u',NULL,NULL,0);",
  );
  mappings = [];
  denied = false;
  mappingConflict = false;
  review = {
    authorize: async () => {
      if (denied)
        throw new RequestBoundaryError(
          403,
          'MEMBERSHIP_CHANGED',
          'permission changed',
        );
      return { role: 'project_owner' };
    },
    state: async () => ({
      sources: [source],
      mappings,
      mappingVersionId: null,
      profiles: [],
      runs: [],
    }),
    readSource: async () => ({ sheets: [sheet], sha256: 'a'.repeat(64) }),
    mutate: async (
      _actor: unknown,
      _project: unknown,
      input: { mappings: Mapping[] },
    ) => {
      if (mappingConflict) throw new Error('D1_ERROR: MAPPING_CONFLICT');
      mappings = input.mappings;
      return { id: 'map' };
    },
  } as unknown as ReviewService;
});
afterEach(() => storage.close());
const counts = () => ({
  runs: storage.sqlite.prepare('SELECT count(*) AS n FROM qc_basic_run').get()
    ?.n,
  audits: storage.sqlite.prepare('SELECT count(*) AS n FROM audit_event').get()
    ?.n,
});
describe('resumable basic review persistence', () => {
  it('uses separate audit request IDs for first-run auto mapping and completion', async () => {
    const original = review.mutate.bind(review);
    review.mutate = async (...args) => {
      storage.sqlite
        .prepare(
          "INSERT INTO audit_event(id,project_id,actor_id,action,target_type,target_id,payload_json,request_id,created_at) VALUES (?,'p','u','review.mapping.saved','mapping','map','{}',?,'now')",
        )
        .run(crypto.randomUUID(), args[3]);
      return original(...args);
    };
    const service = new BaselineService(review);
    const job = await service.start(actor, 'p', 'c', crypto.randomUUID());
    await service.continue(actor, 'p', 'c', job.id, 'external-request');
    const done = await service.continue(
      actor,
      'p',
      'c',
      job.id,
      'external-request',
    );
    expect(done.state).toBe('completed');
    expect(counts()).toEqual({ runs: 1, audits: 2 });
    expect(
      storage.sqlite
        .prepare('SELECT request_id FROM audit_event ORDER BY request_id')
        .all()
        .map((row) => row.request_id),
    ).toEqual([`${job.id}:auto-mapping`, 'external-request'].sort());
  });
  it('is idempotent for duplicate start and concurrent continue; retains immutable result', async () => {
    const service = new BaselineService(review);
    const key = crypto.randomUUID();
    const first = await service.start(actor, 'p', 'c', key);
    const second = await service.start(actor, 'p', 'c', key);
    expect(first.id).toBe(second.id);
    await Promise.all([
      service.continue(actor, 'p', 'c', first.id, 'req'),
      service.continue(actor, 'p', 'c', first.id, 'req'),
    ]);
    expect(
      storage.sqlite.prepare('SELECT cursor FROM qc_basic_job').get()?.cursor,
    ).toBe(1);
    const done = await service.continue(actor, 'p', 'c', first.id, 'req');
    expect(done.state).toBe('completed');
    expect(counts()).toEqual({ runs: 1, audits: 1 });
    await service.continue(actor, 'p', 'c', first.id, 'again');
    expect(counts()).toEqual({ runs: 1, audits: 1 });
    expect(() => storage.sqlite.exec('DELETE FROM qc_basic_run')).toThrow(
      'immutable',
    );
    expect(
      storage.sqlite.prepare('SELECT policy_json FROM qc_basic_job').get()
        ?.policy_json,
    ).toBe(BASIC_POLICY);
  });
  it('does not fail the completed computation for a raw D1 mapping CAS conflict', async () => {
    const service = new BaselineService(review);
    const job = await service.start(actor, 'p', 'c', crypto.randomUUID());
    await service.continue(actor, 'p', 'c', job.id, 'req');
    mappingConflict = true;
    expect((await service.continue(actor, 'p', 'c', job.id, 'req')).state).toBe(
      'completed',
    );
    expect(
      [...mock.objects.values()].some((text) =>
        text.includes('다른 창의 열 연결 변경'),
      ),
    ).toBe(true);
  });
  it('preserves fixed engine policy and refuses an old-policy job', async () => {
    const id = crypto.randomUUID();
    storage.sqlite
      .prepare(
        "INSERT INTO qc_basic_job(id,project_id,case_id,actor_id,request_key,sources_json,mappings_json,policy_json,state,created_at,updated_at) VALUES (?,'p','c','u',?,?,'[]','old-policy','running','now','now')",
      )
      .run(id, crypto.randomUUID(), JSON.stringify([source]));
    expect(() =>
      storage.sqlite
        .prepare('UPDATE qc_basic_job SET policy_json=? WHERE id=?')
        .run(BASIC_POLICY, id),
    ).toThrow('immutable job snapshot');
    const status = await new BaselineService(review).continue(
      actor,
      'p',
      'c',
      id,
      'req',
    );
    expect(status.state).toBe('failed');
    expect(status.error).toContain('기준이 업데이트');
    expect(counts().runs).toBe(0);
  });
  it('rejects modified part content before creating a completed run', async () => {
    const service = new BaselineService(review);
    const job = await service.start(actor, 'p', 'c', crypto.randomUUID());
    await service.continue(actor, 'p', 'c', job.id, 'req');
    for (const key of mock.objects.keys()) mock.objects.set(key, '{}');
    await expect(
      service.continue(actor, 'p', 'c', job.id, 'req'),
    ).rejects.toMatchObject({ code: 'JOB_INTEGRITY' });
    expect(counts().runs).toBe(0);
  });
  it('does not replace an original 403 with the failed status write error', async () => {
    const service = new BaselineService(review);
    const job = await service.start(actor, 'p', 'c', crypto.randomUUID());
    mock.onPut = () => {
      denied = true;
      storage.sqlite.exec('DELETE FROM project_member');
    };
    await expect(
      service.continue(actor, 'p', 'c', job.id, 'req'),
    ).rejects.toMatchObject({ status: 403, code: 'MEMBERSHIP_CHANGED' });
    expect(counts().runs).toBe(0);
  });
  it('retains saved mappings when they exist before the basic run', async () => {
    const saved = suggestMapping(
      sheet,
      source.sourceVersionId,
      source.filename,
    );
    mappings = [saved];
    const service = new BaselineService(review);
    const job = await service.start(actor, 'p', 'c', crypto.randomUUID());
    await service.continue(actor, 'p', 'c', job.id, 'req');
    await service.continue(actor, 'p', 'c', job.id, 'req');
    expect(mappings).toEqual([saved]);
  });
});
