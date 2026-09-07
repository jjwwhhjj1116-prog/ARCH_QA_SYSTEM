// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../../tests/helpers/sqlite-d1';
import { hashPassword, verifyPassword, tokenHash } from './password';
import {
  employeeActor,
  loginEmployee,
  logoutEmployee,
  sessionCookie,
} from './employee-server';
import { authenticateRequest } from './request-actor';
import { isApplicationAdmin } from './administrators';
import { provisionConfiguredRoster } from './roster';

const mock = vi.hoisted(() => ({ db: null as D1Database | null }));
vi.mock('@/db', () => ({ getD1Binding: () => mock.db }));
let storage: ReturnType<typeof sqliteD1>;
const email = 'staff@example.invalid';
const password = 'Synthetic password 123!';
const request = () =>
  new Request('https://qc.example.invalid/api/auth/login', {
    method: 'POST',
    headers: { origin: 'https://qc.example.invalid' },
  });
beforeEach(async () => {
  storage = sqliteD1();
  mock.db = storage.db;
  vi.stubEnv('EMPLOYEE_LOGIN_ENABLED', 'true');
  for (let i = 1; i <= 8; i++) vi.stubEnv(`EMPLOYEE_ROSTER_${i}`, '');
  storage.sqlite
    .prepare('INSERT INTO user_profile VALUES (?,?,?,?)')
    .run('staff', email, 'Synthetic', 0);
  storage.sqlite
    .prepare(
      'INSERT INTO employee_account(id,email,password_hash,created_at) VALUES (?,?,?,?)',
    )
    .run('staff', email, await hashPassword(password), 0);
});
afterEach(() => {
  storage.close();
  vi.unstubAllEnvs();
});
describe('employee login and identity boundaries', () => {
  it('uses salted hashes and preserves password whitespace', async () => {
    const hash = await hashPassword(' secret ');
    expect(hash).not.toContain('secret');
    expect(await verifyPassword(' secret ', hash)).toBe(true);
    expect(await verifyPassword('secret', hash)).toBe(false);
    expect(await verifyPassword(' secret ', 'malformed')).toBe(false);
  });
  it('logs in case-insensitively without storing plain session tokens; logout revokes', async () => {
    const token = await loginEmployee(
      email.toUpperCase(),
      password,
      request(),
      'req',
    );
    const headers = new Headers({ cookie: sessionCookie(token) });
    expect(await employeeActor(headers)).toMatchObject({
      id: 'staff',
      email,
      source: 'employee',
    });
    expect(
      storage.sqlite.prepare('SELECT token_hash FROM employee_session').get()
        ?.token_hash,
    ).toBe(await tokenHash(token));
    await logoutEmployee(headers);
    await expect(employeeActor(headers)).rejects.toMatchObject({ status: 401 });
  });
  it.each(['active=0', 'credential_version=credential_version+1'])(
    'rechecks account %s after login',
    async (change) => {
      const token = await loginEmployee(email, password, request(), 'req');
      storage.sqlite.exec(`UPDATE employee_account SET ${change}`);
      await expect(
        employeeActor(new Headers({ cookie: sessionCookie(token) })),
      ).rejects.toMatchObject({ status: 401 });
    },
  );
  it('expires sessions and ignores forged platform headers when employee login is enabled', async () => {
    const token = await loginEmployee(email, password, request(), 'req');
    storage.sqlite.exec('UPDATE employee_session SET expires_at=0');
    await expect(
      employeeActor(new Headers({ cookie: sessionCookie(token) })),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      authenticateRequest(
        new Headers({
          'oai-authenticated-user-id': 'staff',
          'oai-authenticated-user-email': 'yjw@con-cost.com',
        }),
        'production',
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('rate limits unknown accounts without exposing account existence', async () => {
    for (let i = 0; i < 10; i++)
      await expect(
        loginEmployee('unknown@example.invalid', 'wrong', request(), 'req'),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(
      loginEmployee('unknown@example.invalid', 'wrong', request(), 'req'),
    ).rejects.toMatchObject({ status: 429 });
  });
  it('has exactly two admins, and SQL cannot disagree with the employee email', () => {
    expect(isApplicationAdmin('YJW@CON-COST.COM')).toBe(true);
    expect(isApplicationAdmin('yjpark@con-cost.com')).toBe(true);
    expect(isApplicationAdmin(email)).toBe(false);
    expect(isApplicationAdmin('yjw@con-cost.com.evil.invalid')).toBe(false);
    expect(() =>
      storage.sqlite.exec("UPDATE user_profile SET email='yjw@con-cost.com'"),
    ).toThrow('EMPLOYEE_IDENTITY_IMMUTABLE');
  });
  it('imports the configured hash roster once, never grants project membership or restores old passwords', async () => {
    const entry = {
      id: crypto.randomUUID(),
      email: 'new@example.invalid',
      name: 'Synthetic new',
      passwordHash: await hashPassword('Test only secret!'),
    };
    vi.stubEnv('EMPLOYEE_ROSTER_1', JSON.stringify([entry]));
    await provisionConfiguredRoster();
    storage.sqlite
      .prepare('UPDATE employee_account SET active=0 WHERE id=?')
      .run(entry.id);
    await provisionConfiguredRoster();
    expect(
      storage.sqlite
        .prepare('SELECT count(*) AS n FROM employee_roster_import')
        .get()?.n,
    ).toBe(1);
    expect(
      storage.sqlite
        .prepare('SELECT active FROM employee_account WHERE id=?')
        .get(entry.id)?.active,
    ).toBe(0);
    expect(
      storage.sqlite.prepare('SELECT count(*) AS n FROM project_member').get()
        ?.n,
    ).toBe(0);
  });
});
