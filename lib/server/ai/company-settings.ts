import { isApplicationAdmin } from '@/lib/auth/administrators';
import {
  geminiResponseError,
  isGeminiModelId,
  readGeminiJson,
} from './gemini-config';
import {
  decryptKey,
  encryptKey,
  personalSettings,
  PersonalSettingsError,
} from './personal-settings';

export const COMPANY_AI_SUBJECT = 'qc-company-gemini';
type Stored = {
  encrypted_key: string | null;
  model: string | null;
  version: number;
  checked_at: string | null;
};
const read = (db: D1Database, subject: string) =>
  db
    .prepare(
      'SELECT encrypted_key,model,version,checked_at FROM personal_ai_settings WHERE subject=?',
    )
    .bind(subject)
    .first<Stored>();

export async function getCompanyGeminiConfig(
  db: D1Database,
  secret: string | undefined,
): Promise<{ apiKey: string; model: string; version: number }> {
  const row = await read(db, COMPANY_AI_SUBJECT);
  if (
    !row?.encrypted_key ||
    !row.model ||
    !isGeminiModelId(row.model) ||
    !row.checked_at
  )
    throw new PersonalSettingsError(
      'COMPANY_AI_NOT_CONFIGURED',
      '관리자가 회사 Gemini API를 연결해야 합니다.',
      409,
    );
  return {
    apiKey: await decryptKey(row.encrypted_key, COMPANY_AI_SUBJECT, secret),
    model: row.model,
    version: row.version,
  };
}

export function companySettings(
  db: D1Database,
  actor: { id: string; email: string },
  secret: string | undefined,
  fetcher: typeof fetch = fetch,
) {
  if (!isApplicationAdmin(actor.email))
    throw new PersonalSettingsError(
      'ADMIN_REQUIRED',
      '관리자만 회사 API 설정에 접근할 수 있습니다.',
      403,
    );
  const service = personalSettings(
    db,
    COMPANY_AI_SUBJECT,
    secret,
    undefined,
    fetcher,
  );
  async function status() {
    const current = await service.status();
    const own = current.configured ? null : await read(db, actor.id);
    return {
      ...current,
      canPromotePersonal: Boolean(
        own?.encrypted_key &&
        own.model &&
        isGeminiModelId(own.model) &&
        own.checked_at,
      ),
    };
  }
  return {
    ...service,
    status,
    async probe(version: number) {
      const config = await getCompanyGeminiConfig(db, secret);
      if (config.version !== version)
        throw new PersonalSettingsError(
          'CONFLICT',
          '설정이 변경되었습니다. 새로 확인해 주세요.',
          409,
        );
      // Fixed non-customer text; never accept arbitrary prompts, keys or models.
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout>;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('generation deadline'));
        }, 60_000);
      });
      try {
        return await Promise.race([
          deadline,
          (async () => {
            const response = await fetcher(
              `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`,
              {
                method: 'POST',
                headers: {
                  'x-goog-api-key': config.apiKey,
                  'content-type': 'application/json',
                },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: 'Reply with OK only.' }] }],
                  generationConfig: { maxOutputTokens: 64 },
                }),
                signal: controller.signal,
                redirect: 'manual',
              },
            );
            const result = {
              model: config.model,
              version: config.version,
              checkedAt: new Date().toISOString(),
              httpStatus: response.status,
              origin:
                response.headers.get('x-qc-gemini-response') === 'upstream'
                  ? 'GOOGLE_HTTP_RESPONSE'
                  : 'UNCONFIRMED_RESPONSE_ORIGIN',
            };
            if (!response.ok) {
              const error = await geminiResponseError(response);
              return {
                ...result,
                completed: false,
                code: error.code,
                diagnostic: error.diagnostic ?? null,
              };
            }
            const body = (await readGeminiJson(response)) as {
              candidates?: Array<{
                content?: {
                  parts?: Array<{ text?: string; thought?: boolean }>;
                };
              }>;
            };
            const completed =
              body?.candidates?.some((candidate) =>
                candidate.content?.parts?.some(
                  (part) =>
                    !part.thought &&
                    typeof part.text === 'string' &&
                    part.text.trim().length > 0,
                ),
              ) === true;
            return {
              ...result,
              completed,
              code: completed ? 'GENERATION_OK' : 'GENERATION_EMPTY',
            };
          })(),
        ]);
      } catch {
        return {
          model: config.model,
          version: config.version,
          checkedAt: new Date().toISOString(),
          httpStatus: null,
          completed: false,
          code: controller.signal.aborted
            ? 'GENERATION_TIMEOUT'
            : 'GENERATION_RESPONSE_UNAVAILABLE',
        };
      } finally {
        clearTimeout(timer!);
      }
    },
    async save(input: Parameters<typeof service.save>[0]) {
      await service.save(input);
      return status();
    },
    async disconnect(version: number) {
      await service.disconnect(version);
      return status();
    },
    async promotePersonal(version: number) {
      const current = await read(db, COMPANY_AI_SUBJECT);
      if (current?.encrypted_key || (current?.version ?? 0) !== version)
        throw new PersonalSettingsError(
          'CONFLICT',
          '회사 설정이 이미 있거나 변경되었습니다. 새로 확인해 주세요.',
          409,
        );
      const own = await read(db, actor.id);
      if (
        !own?.encrypted_key ||
        !own.model ||
        !isGeminiModelId(own.model) ||
        !own.checked_at
      )
        throw new PersonalSettingsError(
          'PERSONAL_AI_NOT_CONFIGURED',
          '현재 관리자 계정에 검증된 개인 API 설정이 없습니다.',
          409,
        );
      const encrypted = await encryptKey(
        await decryptKey(own.encrypted_key, actor.id, secret),
        COMPANY_AI_SUBJECT,
        secret,
      );
      const result = await db.batch([
        db
          .prepare(`INSERT INTO personal_ai_settings(subject,encrypted_key,model,version,checked_at)
          SELECT ?,?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM personal_ai_settings WHERE subject=? AND version=? AND encrypted_key IS NULL)
          ON CONFLICT(subject) DO UPDATE SET encrypted_key=excluded.encrypted_key,model=excluded.model,version=excluded.version,checked_at=excluded.checked_at
          WHERE personal_ai_settings.version=? AND personal_ai_settings.encrypted_key IS NULL`)
          .bind(
            COMPANY_AI_SUBJECT,
            encrypted,
            own.model,
            version + 1,
            own.checked_at,
            version,
            COMPANY_AI_SUBJECT,
            version,
            version,
          ),
        db
          .prepare(
            `INSERT INTO personal_ai_settings_audit(id,subject,action,version,created_at) SELECT ?,?,?,?,? WHERE changes()>0`,
          )
          .bind(
            crypto.randomUUID(),
            COMPANY_AI_SUBJECT,
            'promote-personal',
            version + 1,
            new Date().toISOString(),
          ),
      ]);
      if (result[0].meta.changes !== 1)
        throw new PersonalSettingsError(
          'CONFLICT',
          '회사 설정이 변경되었습니다. 새로 확인해 주세요.',
          409,
        );
      return status();
    },
  };
}
