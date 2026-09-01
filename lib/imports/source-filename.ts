export function canonicalSourceFilename(filename: string): string {
  if (typeof filename !== 'string') throw new Error('invalid filename');
  const value = filename.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (
    value.length < 1 ||
    value.length > 180 ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  ) {
    throw new Error('invalid filename');
  }
  return value;
}
