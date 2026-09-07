const iterations = 600_000;
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
      await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        key,
        256,
      ),
    ),
  );
}
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length > 256)
    throw new Error('Invalid password length');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${iterations}$${hex(salt)}$${await derive(password, salt)}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (
    !password ||
    password.length > 256 ||
    !/^pbkdf2-sha256\$600000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(encoded)
  )
    return false;
  const [, , salt, expected] = encoded.split('$');
  const actual = await derive(password, unhex(salt!));
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
