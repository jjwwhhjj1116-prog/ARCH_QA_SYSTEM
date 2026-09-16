import { describe, it, expect } from 'vitest';
import { pbkdf2Sync, scryptSync } from 'node:crypto';
import { hashPassword, verifyPassword } from './password';
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
describe('password runtime compatibility', () => {
  it('uses the exact OWASP scrypt profile and a fresh salt', async () => {
    const encoded = await hashPassword('synthetic-password');
    expect(encoded).toMatch(
      /^scrypt\$16384\$8\$5\$[a-f0-9]{32}\$[a-f0-9]{64}$/,
    );
    const parts = encoded.split('$');
    expect(parts.at(-1)).toBe(
      hex(
        scryptSync(
          'synthetic-password',
          Buffer.from(parts.at(-2)!, 'hex'),
          32,
          {
            N: 16384,
            r: 8,
            p: 5,
            maxmem: 32 * 1024 * 1024,
          },
        ),
      ),
    );
    expect(await verifyPassword('synthetic-password', encoded)).toBe(true);
    expect(await verifyPassword('wrong', encoded)).toBe(false);
    expect(await hashPassword('synthetic-password')).not.toBe(encoded);
  });
  it('keeps legacy verification without reducing iterations', async () => {
    const salt = Buffer.alloc(16, 1);
    const hash = hex(pbkdf2Sync('legacy-test', salt, 600000, 32, 'sha256'));
    expect(
      await verifyPassword(
        'legacy-test',
        `pbkdf2-sha256$600000$${salt.toString('hex')}$${hash}`,
      ),
    ).toBe(true);
  });
  it('rejects unapproved costs and malformed records before KDF execution', async () => {
    expect(
      await verifyPassword(
        'test',
        `scrypt$16384$8$1$${'0'.repeat(32)}$${'0'.repeat(64)}`,
      ),
    ).toBe(false);
    expect(await verifyPassword('test', 'broken')).toBe(false);
  });
});
