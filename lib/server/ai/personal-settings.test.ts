import { describe, it, expect, vi } from 'vitest';
import { sqliteD1 } from '../../../tests/helpers/sqlite-d1';
import {
  decryptKey,
  encryptKey,
  personalSettings,
  personalSettingsInput,
} from './personal-settings';

const secret = '11'.repeat(32);
const key = 'synthetic-test-key-never-real';
const model = 'gemini-3.8-flash';
const verify = () =>
  vi.fn().mockResolvedValue({ provider: 'gemini', status: 'connected', model });
describe('personal Gemini settings', () => {
  it('encrypts with randomized IV and binds the ciphertext to the subject', async () => {
    const a = await encryptKey(key, 'a', secret),
      b = await encryptKey(key, 'a', secret);
    expect(a).not.toBe(b);
    expect(a).not.toContain(key);
    expect(await decryptKey(a, 'a', secret)).toBe(key);
    await expect(decryptKey(a, 'b', secret)).rejects.toThrow();
    await expect(decryptKey(a, 'a', '22'.repeat(32))).rejects.toThrow();
    await expect(encryptKey(key, 'a', undefined)).rejects.toThrow();
  });
  it('persists only encrypted keys, isolates accounts, changes models and audits without secrets', async () => {
    const fixture = sqliteD1();
    try {
      const test = verify();
      const own = personalSettings(fixture.db, 'alice', secret, test);
      const saved = await own.save({ version: 0, model, apiKey: key });
      expect(saved.configured).toBe(true);
      expect(saved.version).toBe(1);
      expect(JSON.stringify(saved)).not.toContain(key);
      expect(
        (await personalSettings(fixture.db, 'bob', secret, test).status())
          .configured,
      ).toBe(false);
      const fresh = personalSettings(fixture.db, 'alice', secret, test);
      expect((await fresh.status()).version).toBe(1);
      await fresh.save({ version: 1, model: 'gemini-2.5-flash' });
      expect(test.mock.calls[1][0].environment.GEMINI_API_KEY).toBe(key);
      const rows = fixture.sqlite
        .prepare('SELECT * FROM personal_ai_settings')
        .all();
      expect(JSON.stringify(rows)).not.toContain(key);
      expect(
        fixture.sqlite
          .prepare('SELECT * FROM personal_ai_settings_audit')
          .all(),
      ).toHaveLength(2);
    } finally {
      fixture.close();
    }
  });
  it('preserves old configuration on provider failure; disconnect creates a tombstone and rejects stale writes', async () => {
    const fixture = sqliteD1();
    try {
      const test = verify();
      const own = personalSettings(fixture.db, 'alice', secret, test);
      await own.save({ version: 0, model, apiKey: key });
      test.mockRejectedValueOnce(new Error('provider unavailable'));
      await expect(
        own.save({ version: 1, model, apiKey: 'replacement-synthetic-key' }),
      ).rejects.toThrow();
      expect((await own.status()).version).toBe(1);
      await expect(own.disconnect(0)).rejects.toThrow('다른 창');
      expect(
        fixture.sqlite
          .prepare('SELECT * FROM personal_ai_settings_audit')
          .all(),
      ).toHaveLength(1);
      const removed = await own.disconnect(1);
      expect(removed.configured).toBe(false);
      expect(removed.version).toBe(2);
      await expect(own.save({ version: 2, model })).rejects.toThrow('입력');
      expect(
        fixture.sqlite
          .prepare('SELECT encrypted_key FROM personal_ai_settings')
          .get()?.encrypted_key,
      ).toBeNull();
      expect(
        fixture.sqlite
          .prepare('SELECT * FROM personal_ai_settings_audit')
          .all(),
      ).toHaveLength(2);
    } finally {
      fixture.close();
    }
  });
  it('rejects invalid models, owner injection and malformed keys', () => {
    for (const value of [
      { version: 0, model: 'unknown' },
      { version: 0, model, owner: 'other' },
      { version: 0, model, apiKey: '' },
      { version: 0, model, apiKey: 'x'.repeat(257) },
    ])
      expect(personalSettingsInput.safeParse(value).success).toBe(false);
  });
});
