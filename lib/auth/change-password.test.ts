// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../../tests/helpers/sqlite-d1';
import { hashPassword, tokenHash, verifyPassword } from './password';
import { employeeActor, sessionCookie } from './employee-server';
import { POST } from '../../app/api/auth/[action]/route';

const mock = vi.hoisted(() => ({ db: null as D1Database | null }));
vi.mock('@/db', () => ({ getD1Binding: () => mock.db }));
const oldPassword = 'Synthetic original password!';
const nextPassword = ' Synthetic replacement password! ';
const token = 'a'.repeat(64);
let storage: ReturnType<typeof sqliteD1>;
const cookieHeaders = () => new Headers({ cookie: sessionCookie(token) });
const account = () =>
  storage.sqlite.prepare('SELECT * FROM employee_account').get();
function request(
  body: unknown,
  options: { origin?: string; cookie?: boolean } = {},
) {
  return new Request('https://qc.example.invalid/api/auth/change-password', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: options.origin ?? 'https://qc.example.invalid',
      ...(options.cookie === false ? {} : { cookie: sessionCookie(token) }),
    },
    body: JSON.stringify(body),
  });
}
function change(
  body = { currentPassword: oldPassword, newPassword: nextPassword },
  options = {},
) {
  return POST(request(body, options), {
    params: Promise.resolve({ action: 'change-password' }),
  });
}
beforeEach(async () => {
  storage = sqliteD1();
  mock.db = storage.db;
  vi.stubEnv('EMPLOYEE_LOGIN_ENABLED', 'true');
  vi.stubEnv('APP_ORIGIN', 'https://qc.example.invalid');
  storage.sqlite
    .prepare('INSERT INTO user_profile VALUES (?,?,?,?)')
    .run('synthetic-staff', 'staff@example.invalid', 'Synthetic name', 0);
  storage.sqlite
    .prepare(
      'INSERT INTO employee_account(id,email,password_hash,created_at) VALUES (?,?,?,?)',
    )
    .run(
      'synthetic-staff',
      'staff@example.invalid',
      await hashPassword(oldPassword),
      0,
    );
  for (const value of [token, 'b'.repeat(64)]) {
    storage.sqlite
      .prepare('INSERT INTO employee_session VALUES (?,?,?,?,?)')
      .run(
        await tokenHash(value),
        'synthetic-staff',
        1,
        Date.now() + 60_000,
        0,
      );
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  storage.close();
});

describe('employee self-service password change', () => {
  it('changes only credentials, audits once, expires the cookie and invalidates all old sessions', async () => {
    const before = account();
    const profile = storage.sqlite.prepare('SELECT * FROM user_profile').get();
    const response = await change();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { changed: true } });
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const after = account()!;
    expect(after).toMatchObject({
      id: before!.id,
      email: before!.email,
      active: 1,
      created_at: 0,
      credential_version: 2,
    });
    expect(
      await verifyPassword(nextPassword, after.password_hash as string),
    ).toBe(true);
    expect(
      await verifyPassword(oldPassword, after.password_hash as string),
    ).toBe(false);
    expect(storage.sqlite.prepare('SELECT * FROM user_profile').get()).toEqual(
      profile,
    );
    for (const value of [token, 'b'.repeat(64)]) {
      await expect(
        employeeActor(new Headers({ cookie: sessionCookie(value) })),
      ).rejects.toMatchObject({ status: 401 });
    }
    const events = storage.sqlite
      .prepare('SELECT outcome,actor_id FROM auth_event')
      .all();
    expect(events).toEqual([
      { outcome: 'password_changed', actor_id: 'synthetic-staff' },
    ]);
    expect(JSON.stringify(events)).not.toContain(nextPassword);
  });
  it('requires the real employee session and exact same-origin before any mutation', async () => {
    const before = account();
    expect((await change(undefined, { cookie: false })).status).toBe(401);
    expect(
      (await change(undefined, { origin: 'https://evil.invalid' })).status,
    ).toBe(403);
    expect(account()).toEqual(before);
    expect(
      storage.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_attempt').get()?.n,
    ).toBe(0);
  });
  it.each(['short', 'x'.repeat(129)])(
    'rejects invalid new-password length',
    async (newPassword) => {
      const response = await change({
        currentPassword: oldPassword,
        newPassword,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'INVALID_PASSWORD_INPUT' },
      });
      expect(account()?.credential_version).toBe(1);
    },
  );
  it('rejects the old password without changing credentials or sessions', async () => {
    const response = await change({
      currentPassword: oldPassword,
      newPassword: oldPassword,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'PASSWORD_UNCHANGED' },
    });
    expect(await employeeActor(cookieHeaders())).toMatchObject({
      id: 'synthetic-staff',
    });
  });
  it('rejects wrong current passwords and rate limits the account after five attempts', async () => {
    for (let i = 0; i < 5; i++) {
      const response = await change({
        currentPassword: 'wrong',
        newPassword: nextPassword,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'CURRENT_PASSWORD_INVALID' },
      });
    }
    const response = await change();
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: { code: 'PASSWORD_CHANGE_RATE_LIMIT' },
    });
    expect(account()?.credential_version).toBe(1);
    expect(
      storage.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM auth_event WHERE outcome='password_change_failed'",
        )
        .get()?.n,
    ).toBe(5);
  });
  it.each(['version', 'logout'])(
    'aborts a concurrent %s change without a false success audit',
    async (race) => {
      const batch = storage.db.batch.bind(storage.db);
      vi.spyOn(storage.db, 'batch').mockImplementationOnce(
        async (statements) => {
          if (race === 'version')
            storage.sqlite.exec(
              'UPDATE employee_account SET credential_version=credential_version+1',
            );
          else storage.sqlite.exec('DELETE FROM employee_session');
          return batch(statements);
        },
      );
      const response = await change();
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: { code: 'PASSWORD_CHANGE_CONFLICT' },
      });
      expect(
        await verifyPassword(oldPassword, account()!.password_hash as string),
      ).toBe(true);
      expect(
        storage.sqlite
          .prepare(
            "SELECT COUNT(*) AS n FROM auth_event WHERE outcome='password_changed'",
          )
          .get()?.n,
      ).toBe(0);
    },
  );
  it('rolls back the password when the audit cannot commit', async () => {
    const before = account();
    storage.sqlite.exec(
      "CREATE TRIGGER fail_password_audit BEFORE INSERT ON auth_event WHEN NEW.outcome='password_changed' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;",
    );
    expect((await change()).status).toBe(503);
    expect(account()).toEqual(before);
    expect(await employeeActor(cookieHeaders())).toMatchObject({
      id: 'synthetic-staff',
    });
  });
});
