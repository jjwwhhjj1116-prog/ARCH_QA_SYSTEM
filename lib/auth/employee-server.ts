import { getD1Binding } from '@/db';
import type { Actor } from '@/lib/domain/contracts';
import { AuthenticationError } from './request-actor';
import { randomSessionToken, tokenHash, verifyPassword } from './password';
import { provisionConfiguredRoster } from './roster';

export const employeeLoginEnabled = () =>
  process.env.EMPLOYEE_LOGIN_ENABLED === 'true';
export const sessionCookieName = () =>
  process.env.NODE_ENV === 'production' ? '__Host-qc_session' : 'qc_session';
export function sessionCookie(token: string, maxAge = 8 * 3600) {
  return `${sessionCookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
function readToken(headers: Headers) {
  const value = headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${sessionCookieName()}=`))
    ?.split('=')[1];
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export async function employeeActor(headers: Headers): Promise<Actor> {
  const token = readToken(headers);
  if (!token) throw new AuthenticationError('직원 계정으로 로그인해 주세요.');
  const row = await getD1Binding()
    .prepare(
      `SELECT u.id,e.email,u.display_name FROM employee_session s JOIN employee_account e ON e.id=s.account_id JOIN user_profile u ON u.id=e.id WHERE s.token_hash=? AND s.expires_at>? AND e.active=1 AND s.credential_version=e.credential_version`,
    )
    .bind(await tokenHash(token), Date.now())
    .first<{ id: string; email: string; display_name: string }>();
  if (!row)
    throw new AuthenticationError(
      '로그인이 만료되었습니다. 다시 로그인해 주세요.',
    );
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    source: 'employee',
  };
}
export async function loginEmployee(
  email: string,
  password: string,
  request: Request,
  requestId: string,
) {
  await provisionConfiguredRoster();
  const db = getD1Binding();
  const now = Date.now();
  const normalized = email.trim().toLowerCase();
  // Atomic counters bound both one account and a source address. No IP/email in logs.
  const address = request.headers.get('cf-connecting-ip');
  const buckets = await Promise.all([
    tokenHash(`account:${normalized}`),
    ...(address ? [tokenHash(`address:${address}`)] : []),
  ]);
  await db.batch([
    db
      .prepare(
        'DELETE FROM auth_attempt WHERE bucket IN (SELECT bucket FROM auth_attempt WHERE expires_at<=? LIMIT 100)',
      )
      .bind(now),
    db
      .prepare(
        'DELETE FROM employee_session WHERE token_hash IN (SELECT token_hash FROM employee_session WHERE expires_at<=? LIMIT 100)',
      )
      .bind(now),
  ]);
  const counts = await db.batch(
    buckets.map((bucket) =>
      db
        .prepare(
          `INSERT INTO auth_attempt(bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at<=? THEN ? ELSE expires_at END RETURNING attempts`,
        )
        .bind(bucket, now + 15 * 60_000, now, now, now + 15 * 60_000),
    ),
  );
  if (
    counts.some(
      (r, i) =>
        Number((r.results[0] as { attempts?: number })?.attempts) >
        (i === 0 ? 10 : 100),
    )
  )
    throw new AuthenticationError(
      '로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.',
      'LOGIN_RATE_LIMIT',
      429,
    );
  const account = await db
    .prepare(
      `SELECT id,password_hash,credential_version,active FROM employee_account WHERE email=? COLLATE NOCASE`,
    )
    .bind(normalized)
    .first<{
      id: string;
      password_hash: string;
      credential_version: number;
      active: number;
    }>();
  const dummy =
    'pbkdf2-sha256$600000$00000000000000000000000000000000$' + '0'.repeat(64);
  const matches = await verifyPassword(
    password,
    account?.password_hash ?? dummy,
  );
  if (!account || !account.active || !matches) {
    await db
      .prepare('INSERT INTO auth_event VALUES (?,?,?,?,?)')
      .bind(crypto.randomUUID(), null, 'login_failed', requestId, now)
      .run();
    throw new AuthenticationError(
      '아이디 또는 비밀번호를 확인해 주세요.',
      'INVALID_CREDENTIALS',
    );
  }
  const token = randomSessionToken();
  const previous = readToken(request.headers);
  const session = db
    .prepare(
      `INSERT INTO employee_session SELECT ?,id,credential_version,?,? FROM employee_account WHERE id=? AND active=1 AND credential_version=?`,
    )
    .bind(
      await tokenHash(token),
      now + 8 * 3600_000,
      now,
      account.id,
      account.credential_version,
    );
  const statements = [
    session,
    db
      .prepare(
        'INSERT INTO auth_event SELECT ?,account_id,?,?,? FROM employee_session WHERE token_hash=?',
      )
      .bind(
        crypto.randomUUID(),
        'login_succeeded',
        requestId,
        now,
        await tokenHash(token),
      ),
  ];
  if (previous)
    statements.push(
      db
        .prepare('DELETE FROM employee_session WHERE token_hash=?')
        .bind(await tokenHash(previous)),
    );
  const result = await db.batch(statements);
  if (result[0]?.meta.changes !== 1)
    throw new AuthenticationError(
      '계정 상태가 변경되었습니다. 다시 로그인해 주세요.',
    );
  return token;
}
export async function logoutEmployee(headers: Headers) {
  const token = readToken(headers);
  if (token)
    await getD1Binding()
      .prepare('DELETE FROM employee_session WHERE token_hash=?')
      .bind(await tokenHash(token))
      .run();
}
