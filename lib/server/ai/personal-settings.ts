import { z } from 'zod';
import { GEMINI_MODELS, testGeminiConnection } from './gemini-config';

export class PersonalSettingsError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const personalSettingsInput = z
  .object({
    version: z.number().int().nonnegative(),
    model: z
      .string()
      .refine((value) => GEMINI_MODELS.some((model) => model.id === value)),
    apiKey: z
      .string()
      .trim()
      .min(20)
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict();

type Row = {
  subject: string;
  encrypted_key: string | null;
  model: string | null;
  version: number;
  checked_at: string | null;
};
export type PersonalAiStatus = {
  configured: boolean;
  storageReady: boolean;
  model: string | null;
  version: number;
  checkedAt: string | null;
  availableModels: typeof GEMINI_MODELS;
};

const bytes = new TextEncoder();
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value));
const decode = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
export function encryptionReady(secret: string | undefined) {
  return Boolean(secret && /^[a-f0-9]{64}$/i.test(secret));
}
async function cryptoKey(secret: string | undefined) {
  if (!encryptionReady(secret))
    throw new PersonalSettingsError(
      'AI_STORAGE_UNAVAILABLE',
      '안전한 키 저장소를 준비하지 못했습니다. 관리자에게 문의해 주세요.',
      503,
    );
  return crypto.subtle.importKey(
    'raw',
    Uint8Array.from(secret!.match(/../g)!, (hex) => parseInt(hex, 16)),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encryptKey(
  value: string,
  subject: string,
  secret: string | undefined,
) {
  const key = await cryptoKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: bytes.encode(`qc-personal-gemini-v1:${subject}`),
    },
    key,
    bytes.encode(value),
  );
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
export async function decryptKey(
  value: string,
  subject: string,
  secret: string | undefined,
) {
  const key = await cryptoKey(secret);
  try {
    const [iv, encrypted] = value.split('.');
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: decode(iv),
          additionalData: bytes.encode(`qc-personal-gemini-v1:${subject}`),
        },
        key,
        decode(encrypted),
      ),
    );
  } catch {
    throw new PersonalSettingsError(
      'AI_KEY_UNREADABLE',
      '저장된 키를 읽지 못했습니다. 새 키를 입력해 다시 연결해 주세요.',
      503,
    );
  }
}

export function personalSettings(
  db: D1Database,
  subject: string,
  secret: string | undefined,
  verify = testGeminiConnection,
) {
  const read = () =>
    db
      .prepare(
        'SELECT subject, encrypted_key, model, version, checked_at FROM personal_ai_settings WHERE subject = ?',
      )
      .bind(subject)
      .first<Row>();
  async function status(): Promise<PersonalAiStatus> {
    const row = await read();
    return {
      configured: Boolean(row?.encrypted_key),
      storageReady: encryptionReady(secret),
      model: row?.model ?? null,
      version: row?.version ?? 0,
      checkedAt: row?.checked_at ?? null,
      availableModels: GEMINI_MODELS,
    };
  }
  async function change(
    version: number,
    encrypted: string | null,
    model: string | null,
    checkedAt: string | null,
  ) {
    const next = version + 1;
    const id = crypto.randomUUID();
    const results = await db.batch([
      db
        .prepare(`INSERT INTO personal_ai_settings (subject, encrypted_key, model, version, checked_at)
        SELECT ?, ?, ?, ?, ? WHERE ? = 0 OR EXISTS (SELECT 1 FROM personal_ai_settings WHERE subject = ? AND version = ?)
        ON CONFLICT(subject) DO UPDATE SET encrypted_key = excluded.encrypted_key, model = excluded.model, version = excluded.version, checked_at = excluded.checked_at
        WHERE personal_ai_settings.version = ?`)
        .bind(
          subject,
          encrypted,
          model,
          next,
          checkedAt,
          version,
          subject,
          version,
          version,
        ),
      db
        .prepare(`INSERT INTO personal_ai_settings_audit (id, subject, action, version, created_at)
        SELECT ?, ?, ?, ?, ? WHERE changes() > 0`)
        .bind(
          id,
          subject,
          encrypted ? 'save' : 'disconnect',
          next,
          new Date().toISOString(),
        ),
    ]);
    if (results[0].meta.changes !== 1)
      throw new PersonalSettingsError(
        'CONFLICT',
        '다른 창에서 설정이 변경되었습니다. 새로 확인한 뒤 다시 저장해 주세요.',
        409,
      );
    return status();
  }
  return {
    status,
    async save(input: z.infer<typeof personalSettingsInput>) {
      await cryptoKey(secret);
      const row = await read();
      if ((row?.version ?? 0) !== input.version)
        throw new PersonalSettingsError(
          'CONFLICT',
          '설정이 변경되었습니다. 새로 확인해 주세요.',
          409,
        );
      const apiKey =
        input.apiKey ??
        (row?.encrypted_key
          ? await decryptKey(row.encrypted_key, subject, secret)
          : null);
      if (!apiKey)
        throw new PersonalSettingsError(
          'API_KEY_REQUIRED',
          'Gemini API 키를 입력해 주세요.',
        );
      await verify({
        environment: { GEMINI_API_KEY: apiKey, GEMINI_MODEL: input.model },
        verifyResponse: true,
      });
      return change(
        input.version,
        await encryptKey(apiKey, subject, secret),
        input.model,
        new Date().toISOString(),
      );
    },
    async disconnect(version: number) {
      return change(version, null, null, null);
    },
  };
}
