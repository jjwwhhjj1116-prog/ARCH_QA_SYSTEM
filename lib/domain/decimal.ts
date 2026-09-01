import Decimal from 'decimal.js';

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

export function canonicalDecimal(value: Decimal.Value): string {
  const parsed = new Decimal(value);
  if (!parsed.isFinite())
    throw new Error('유한한 십진수만 저장할 수 있습니다.');
  if (parsed.isZero()) return '0';
  return parsed
    .toFixed()
    .replace(/\.0+$|(?<=\.[0-9]*?)0+$/u, '')
    .replace(/\.$/u, '');
}

export function decimalsEqual(
  left: Decimal.Value,
  right: Decimal.Value,
): boolean {
  return new Decimal(left).equals(new Decimal(right));
}
