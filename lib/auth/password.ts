import { scrypt } from 'node:crypto';

const iterations = 600_000;
// OWASP scrypt profile: N=2^14, r=8, p=5. Native Workers PBKDF2 caps
// iterations at 100,000; do not weaken the existing 600,000-round hashes.
const scryptOptions = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
const scryptDerive = (password: string, salt: Uint8Array) =>
  new Promise<string>((resolve, reject) => {
    scrypt(password, salt, 32, scryptOptions, (error, key) => {
      if (error) reject(error);
      else resolve(hex(key));
    });
  });
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('');
const unhex = (value: string) =>
  Uint8Array.from(value.match(/../g) ?? [], (v) => Number.parseInt(v, 16));
async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return hex(
    new Uint8Array(
      await crypto.subtle
        .deriveBits(
          { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
          key,
          256,
        )
        .catch((error: unknown) => {
          console.error(
            'PASSWORD_KDF_FAILURE',
            error instanceof Error &&
              /iteration|Pbkdf|PBKDF/.test(error.message)
              ? 'ITERATION_LIMIT'
              : 'CRYPTO_UNAVAILABLE',
          );
          throw error;
        }),
    ),
  );
}
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length > 256)
    throw new Error('Invalid password length');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `scrypt$16384$8$5$${hex(salt)}$${await scryptDerive(password, salt)}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (
    !password ||
    password.length > 256 ||
    !/^(?:pbkdf2-sha256\$600000|scrypt\$16384\$8\$5)\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(
      encoded,
    )
  )
    return false;
  const fields = encoded.split('$');
  const salt = fields.at(-2)!;
  const expected = fields.at(-1)!;
  const actual = encoded.startsWith('scrypt$')
    ? await scryptDerive(password, unhex(salt))
    : await derive(password, unhex(salt));
  let diff = 0;
  for (let i = 0; i < actual.length; i++)
    diff |= actual.charCodeAt(i) ^ expected!.charCodeAt(i);
  return diff === 0;
}
export async function tokenHash(value: string): Promise<string> {
  return hex(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  );
}
export const randomSessionToken = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)));
