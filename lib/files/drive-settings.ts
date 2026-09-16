import { z } from 'zod';
import { isApplicationAdmin } from '@/lib/auth/administrators';
import {
  encryptKey,
  decryptKey,
  encryptionReady,
} from '@/lib/server/ai/personal-settings';
import {
  createDriveAuthorization,
  requestDriveToken,
  verifyDriveAccount,
  driveFiles,
  DriveError,
  QC_DRIVE_DEFAULT_ACCOUNT,
} from './google-drive';

export const driveSettingsInput = z
  .object({
    version: z.number().int().nonnegative(),
    clientId: z
      .string()
      .trim()
      .regex(/^[\w.-]+\.apps\.googleusercontent\.com$/u),
    clientSecret: z
      .string()
      .trim()
      .min(10)
      .max(4096)
      .regex(/^[\x21-\x7e]+$/u)
      .optional(),
    targetEmail: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
  })
  .strict();
type Settings = {
  client_id: string;
  encrypted_secret: string;
  target_email: string;
  active_connection: string | null;
  version: number;
};
export type DriveConnection = {
  id: string;
  email: string;
  client_id: string;
  encrypted_secret: string;
  encrypted_refresh: string;
  folder_id: string;
  state: string;
  created_at: string;
};
const now = () => new Date().toISOString();
const conflict = () =>
  new DriveError(
    'DRIVE_SETTINGS_CHANGED',
    '다른 창에서 설정이 바뀌었습니다. 새로 확인해 주세요.',
    409,
  );
export async function connectionToken(
  connection: DriveConnection,
  secret: string | undefined,
  fetcher = fetch,
) {
  const [clientSecret, refreshToken] = await Promise.all([
    decryptKey(
      connection.encrypted_secret,
      `drive-client:${connection.id}`,
      secret,
    ),
    decryptKey(
      connection.encrypted_refresh,
      `drive-refresh:${connection.id}`,
      secret,
    ),
  ]);
  const token = await requestDriveToken(fetcher, {
    clientId: connection.client_id,
    clientSecret,
    refreshToken,
  });
  return token.accessToken;
}
export function driveSettingsService(
  db: D1Database,
  actor: { id: string; email: string },
  secret: string | undefined,
  origin: string,
  fetcher = fetch,
) {
  if (!isApplicationAdmin(actor.email))
    throw new DriveError(
      'DRIVE_ADMIN_REQUIRED',
      '회사 Drive 연결은 관리자만 변경할 수 있습니다.',
      403,
    );
  const read = () =>
    db.prepare('SELECT * FROM qc_drive_settings WHERE id=1').first<Settings>();
  const callback = `${origin}/api/settings/drive/callback`;
  const requireSecret = () => {
    if (!encryptionReady(secret))
      throw new DriveError(
        'DRIVE_ENCRYPTION_REQUIRED',
        '서버 암호화 키가 준비되지 않았습니다. 연결 설정을 저장할 수 없습니다.',
        503,
      );
  };
  const audit = (action: string, id: string | null = null) =>
    db
      .prepare(
        'INSERT INTO qc_drive_audit(id,actor_id,action,connection_id,created_at) VALUES(?,?,?,?,?)',
      )
      .bind(crypto.randomUUID(), actor.id, action, id, now());
  return {
    async status() {
      const settings = await read();
      const current = settings?.active_connection
        ? await db
            .prepare(
              'SELECT id,email,folder_id,created_at FROM qc_drive_connection WHERE id=? AND state=?',
            )
            .bind(settings.active_connection, 'ready')
            .first<{
              id: string;
              email: string;
              folder_id: string;
              created_at: string;
            }>()
        : null;
      return {
        version: settings?.version ?? 0,
        clientId: settings?.client_id ?? '',
        targetEmail: settings?.target_email ?? QC_DRIVE_DEFAULT_ACCOUNT,
        configured: Boolean(settings),
        encryptionReady: encryptionReady(secret),
        callback,
        current,
      };
    },
    async save(raw: unknown) {
      requireSecret();
      const input = driveSettingsInput.parse(raw);
      const settings = await read();
      if ((settings?.version ?? 0) !== input.version) throw conflict();
      if (
        !input.clientSecret &&
        (!settings || settings.client_id !== input.clientId)
      )
        throw new DriveError(
          'DRIVE_CLIENT_SECRET_REQUIRED',
          'OAuth 클라이언트 보안 비밀번호를 입력해 주세요.',
          400,
        );
      const encrypted = input.clientSecret
        ? await encryptKey(input.clientSecret, 'drive-app', secret)
        : settings!.encrypted_secret;
      const result = await db.batch([
        db
          .prepare(`INSERT INTO qc_drive_settings(id,client_id,encrypted_secret,target_email,version)
          VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,encrypted_secret=excluded.encrypted_secret,target_email=excluded.target_email,version=excluded.version WHERE qc_drive_settings.version=?`)
          .bind(
            input.clientId,
            encrypted,
            input.targetEmail,
            input.version + 1,
            input.version,
          ),
        db
          .prepare(
            'INSERT INTO qc_drive_audit(id,actor_id,action,created_at) SELECT ?,?,?,? WHERE changes()=1',
          )
          .bind(crypto.randomUUID(), actor.id, 'settings_saved', now()),
      ]);
      if (result[0].meta.changes !== 1) throw conflict();
      return this.status();
    },
    async start(version: number) {
      requireSecret();
      const settings = await read();
      if (!settings || settings.version !== version) throw conflict();
      const authorization = await createDriveAuthorization({
        clientId: settings.client_id,
        redirectUri: callback,
        expectedEmail: settings.target_email,
      });
      await db.batch([
        db
          .prepare(
            'DELETE FROM qc_drive_oauth_state WHERE actor_id=? OR expires_at<=?',
          )
          .bind(actor.id, now()),
        db
          .prepare(
            'INSERT INTO qc_drive_oauth_state(state_hash,actor_id,version,encrypted_verifier,expires_at) VALUES(?,?,?,?,?)',
          )
          .bind(
            authorization.stateHash,
            actor.id,
            version,
            await encryptKey(
              authorization.verifier,
              `drive-state:${authorization.stateHash}:${actor.id}`,
              secret,
            ),
            new Date(Date.now() + 600000).toISOString(),
          ),
        audit('authorization_started'),
      ]);
      return { url: authorization.url };
    },
    async complete(state: string, code: string) {
      requireSecret();
      z.string()
        .regex(/^[\w-]{43}$/u)
        .parse(state);
      const hashBytes = new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state)),
      );
      const stateHash = [...hashBytes]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      // Atomic consumption: a replay or a different signed-in administrator
      // cannot exchange this authorization code a second time.
      const pending = await db
        .prepare(
          'DELETE FROM qc_drive_oauth_state WHERE state_hash=? AND actor_id=? AND expires_at>? RETURNING *',
        )
        .bind(stateHash, actor.id, now())
        .first<{ encrypted_verifier: string; version: number }>();
      if (!pending)
        throw new DriveError(
          'DRIVE_STATE_EXPIRED',
          '연결 요청이 만료되었거나 이미 사용되었습니다. 설정에서 다시 연결해 주세요.',
          409,
        );
      const settings = await read();
      if (!settings || settings.version !== pending.version) throw conflict();
      const verifier = await decryptKey(
        pending.encrypted_verifier,
        `drive-state:${stateHash}:${actor.id}`,
        secret,
      );
      const clientSecret = await decryptKey(
        settings.encrypted_secret,
        'drive-app',
        secret,
      );
      const token = await requestDriveToken(fetcher, {
        clientId: settings.client_id,
        clientSecret,
        code,
        verifier,
        redirectUri: callback,
      });
      const account = await verifyDriveAccount(
        fetcher,
        token.accessToken,
        settings.target_email,
      );
      const files = driveFiles(fetcher, token.accessToken);
      const id = crypto.randomUUID();
      const folder = await files.allocateId();
      await db
        .prepare(
          'INSERT INTO qc_drive_connection(id,email,client_id,encrypted_secret,encrypted_refresh,folder_id,state,created_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          account.email,
          settings.client_id,
          await encryptKey(clientSecret, `drive-client:${id}`, secret),
          await encryptKey(token.refreshToken!, `drive-refresh:${id}`, secret),
          folder,
          'preparing',
          now(),
        )
        .run();
      await files.createFolder({ id: folder, connectionId: id });
      const updated = await db.batch([
        db
          .prepare(
            'UPDATE qc_drive_settings SET active_connection=?,version=version+1 WHERE id=1 AND version=?',
          )
          .bind(id, settings.version),
        db
          .prepare(
            "UPDATE qc_drive_connection SET state='ready' WHERE id=? AND changes()=1",
          )
          .bind(id),
        db
          .prepare(
            'INSERT INTO qc_drive_audit(id,actor_id,action,connection_id,created_at) SELECT ?,?,?,?,? WHERE changes()=1',
          )
          .bind(
            crypto.randomUUID(),
            actor.id,
            'connection_activated',
            id,
            now(),
          ),
      ]);
      if (updated[0].meta.changes !== 1) throw conflict();
      // Do not revoke previous connections: older file records still use them.
      return this.status();
    },
    async check() {
      const settings = await read();
      const connection = settings?.active_connection
        ? await db
            .prepare(
              "SELECT * FROM qc_drive_connection WHERE id=? AND state='ready'",
            )
            .bind(settings.active_connection)
            .first<DriveConnection>()
        : null;
      if (!connection)
        throw new DriveError(
          'DRIVE_NOT_CONNECTED',
          '회사 Drive 계정을 먼저 연결해 주세요.',
          409,
        );
      const token = await connectionToken(connection, secret, fetcher);
      const account = await verifyDriveAccount(
        fetcher,
        token,
        connection.email,
      );
      await audit('connection_checked', connection.id).run();
      return { ...account, checkedAt: now() };
    },
  };
}
