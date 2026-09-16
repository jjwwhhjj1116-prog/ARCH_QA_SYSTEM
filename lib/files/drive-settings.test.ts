// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../../tests/helpers/sqlite-d1';
import { driveSettingsService } from './drive-settings';
import { DriveStorage } from './drive-storage';
import { QC_DRIVE_SCOPE } from './google-drive';

const secret = '77'.repeat(32);
const admin = { id: 'admin-a', email: 'yjw@con-cost.com' };
const origin = 'https://qc.example';
const fixture = () => {
  const db = sqliteD1();
  let sequence = 0;
  const objects = new Map<
    string,
    { metadata: Record<string, unknown>; bytes?: Uint8Array }
  >();
  const remote = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.hostname === 'oauth2.googleapis.com') {
      const body = init!.body as URLSearchParams;
      const email =
        body.get('code') ?? body.get('refresh_token')!.slice('refresh:'.length);
      return Response.json({
        access_token: `access:${email}`,
        refresh_token: `refresh:${email}`,
        token_type: 'Bearer',
        scope: QC_DRIVE_SCOPE,
      });
    }
    if (url.pathname.endsWith('/about')) {
      const authorization = new Headers(init?.headers).get('Authorization')!;
      return Response.json({
        user: { emailAddress: authorization.slice('Bearer access:'.length) },
      });
    }
    if (url.pathname.endsWith('/generateIds'))
      return Response.json({ ids: [`generatedDrive${++sequence}`] });
    if (init?.method === 'POST') {
      const metadata = JSON.parse(init.body as string) as Record<
        string,
        unknown
      >;
      objects.set(metadata.id as string, { metadata });
      if (url.searchParams.get('uploadType') === 'resumable')
        return new Response(null, {
          headers: {
            Location: `https://www.googleapis.com/upload/drive/v3/files?upload_id=${metadata.id as string}`,
          },
        });
      return Response.json({ ...metadata, trashed: false });
    }
    if (init?.method === 'PUT') {
      const item = objects.get(url.searchParams.get('upload_id')!)!;
      item.bytes = new Uint8Array(init.body as Uint8Array);
      item.metadata.size = String(item.bytes.byteLength);
      return Response.json({ ...item.metadata, trashed: false });
    }
    const item = objects.get(url.pathname.split('/').at(-1)!);
    if (!item || !item.bytes) return Response.json({}, { status: 404 });
    return url.searchParams.get('alt') === 'media'
      ? new Response(new Uint8Array(item.bytes))
      : Response.json({ ...item.metadata, trashed: false });
  });
  const service = driveSettingsService(db.db, admin, secret, origin, remote);
  return { ...db, remote, service, objects };
};
const opened: ReturnType<typeof fixture>[] = [];
function setup() {
  const value = fixture();
  opened.push(value);
  return value;
}
afterEach(() => {
  for (const item of opened.splice(0)) item.close();
});
async function connect(
  f: ReturnType<typeof fixture>,
  email = 'concost.dt@gmail.com',
) {
  const before = await f.service.status();
  const saved = await f.service.save({
    version: before.version,
    clientId: '123-qc.apps.googleusercontent.com',
    clientSecret: 'synthetic-client-secret',
    targetEmail: email,
  });
  const authorization = await f.service.start(saved.version);
  const state = new URL(authorization.url).searchParams.get('state')!;
  return f.service.complete(state, email);
}
describe('company Drive persistent integration', () => {
  it('rejects non-admin accounts at the service boundary', () => {
    const f = setup();
    expect(() =>
      driveSettingsService(
        f.db,
        { id: 'owner', email: 'jy04210810@gmail.com' },
        secret,
        origin,
      ),
    ).toThrow('관리자');
  });
  it('stores encrypted secrets, masks status and rejects stale saves', async () => {
    const f = setup();
    const status = await f.service.save({
      version: 0,
      clientId: '123-qc.apps.googleusercontent.com',
      clientSecret: 'synthetic-client-secret',
      targetEmail: 'concost.dt@gmail.com',
    });
    expect(status.version).toBe(1);
    expect(JSON.stringify(status)).not.toContain('synthetic-client-secret');
    const row = f.sqlite.prepare('SELECT * FROM qc_drive_settings').get();
    expect(JSON.stringify(row)).not.toContain('synthetic-client-secret');
    await expect(
      f.service.save({
        version: 0,
        clientId: status.clientId,
        targetEmail: status.targetEmail,
      }),
    ).rejects.toMatchObject({ code: 'DRIVE_SETTINGS_CHANGED' });
  });
  it('uses one-use actor-bound authorization state and activates only verified account', async () => {
    const f = setup();
    const saved = await f.service.save({
      version: 0,
      clientId: '123-qc.apps.googleusercontent.com',
      clientSecret: 'synthetic-client-secret',
      targetEmail: 'concost.dt@gmail.com',
    });
    const link = await f.service.start(saved.version);
    const state = new URL(link.url).searchParams.get('state')!;
    const other = driveSettingsService(
      f.db,
      { id: 'admin-b', email: 'yjpark@con-cost.com' },
      secret,
      origin,
      f.remote,
    );
    await expect(
      other.complete(state, 'concost.dt@gmail.com'),
    ).rejects.toMatchObject({ code: 'DRIVE_STATE_EXPIRED' });
    expect(
      (await f.service.complete(state, 'concost.dt@gmail.com')).current?.email,
    ).toBe('concost.dt@gmail.com');
    await expect(
      f.service.complete(state, 'concost.dt@gmail.com'),
    ).rejects.toMatchObject({ code: 'DRIVE_STATE_EXPIRED' });
  });
  it('rejects expired authorization without provider requests', async () => {
    const f = setup();
    await connect(f);
    const status = await f.service.status();
    const link = await f.service.start(status.version);
    f.sqlite.exec(
      "UPDATE qc_drive_oauth_state SET expires_at='2000-01-01T00:00:00.000Z'",
    );
    f.remote.mockClear();
    await expect(
      f.service.complete(
        new URL(link.url).searchParams.get('state')!,
        'concost.dt@gmail.com',
      ),
    ).rejects.toMatchObject({ code: 'DRIVE_STATE_EXPIRED' });
    expect(f.remote).not.toHaveBeenCalled();
  });
  it('preserves the active connection when a replacement account does not match', async () => {
    const f = setup();
    const first = await connect(f);
    const updated = await f.service.save({
      version: first.version,
      clientId: first.clientId,
      targetEmail: 'replacement@example.com',
    });
    const link = await f.service.start(updated.version);
    await expect(
      f.service.complete(
        new URL(link.url).searchParams.get('state')!,
        'wrong@example.com',
      ),
    ).rejects.toMatchObject({ code: 'DRIVE_ACCOUNT_MISMATCH' });
    expect((await f.service.status()).current?.id).toBe(first.current?.id);
  });
  it('writes source/results to Drive and reads old objects through their original connection after switching', async () => {
    const f = setup();
    const first = await connect(f);
    const storage = new DriveStorage(f.db, secret, f.remote);
    const base =
      'projects/11111111-1111-4111-8111-111111111111/cases/22222222-2222-4222-8222-222222222222';
    const key = `${base}/reviews/33333333-3333-4333-8333-333333333333.json`;
    const bytes = new TextEncoder().encode('{"result":"synthetic"}');
    await storage.put(key, bytes, 'application/json');
    await storage.put(key, bytes, 'application/json');
    expect(
      f.sqlite.prepare('SELECT COUNT(*) n FROM qc_drive_object').get()?.n,
    ).toBe(1);
    await connect(f, 'replacement@example.com');
    f.remote.mockClear();
    const reloaded = new DriveStorage(f.db, secret, f.remote);
    expect(await (await reloaded.get(key))?.text()).toBe(
      '{"result":"synthetic"}',
    );
    expect(
      new Headers(f.remote.mock.calls.at(-1)![1]!.headers).get('Authorization'),
    ).toBe('Bearer access:concost.dt@gmail.com');
    expect(
      f.sqlite.prepare('SELECT connection_id FROM qc_drive_object').get()
        ?.connection_id,
    ).toBe(first.current?.id);
    await expect(
      reloaded.put(
        key,
        new TextEncoder().encode('different'),
        'application/json',
      ),
    ).rejects.toThrow('덮어쓸');
    f.sqlite.exec("UPDATE qc_drive_object SET state='deleted'");
    await expect(reloaded.put(key, bytes, 'application/json')).rejects.toThrow(
      '덮어쓸',
    );
    expect(await reloaded.get(key)).toBeNull();
  });
});
