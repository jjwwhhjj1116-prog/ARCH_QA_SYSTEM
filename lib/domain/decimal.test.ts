import { describe, expect, it } from 'vitest';
import { canonicalDecimal, decimalsEqual } from './decimal';

describe('decimal contract', () => {
  it('serializes equivalent values identically without binary float drift', () => {
    expect(canonicalDecimal('100.000')).toBe('100');
    expect(canonicalDecimal('0.1000')).toBe('0.1');
    expect(decimalsEqual('0.1', '0.100000')).toBe(true);
  });

  it('does not accept non-finite quantities', () => {
    expect(() => canonicalDecimal(Number.POSITIVE_INFINITY)).toThrow(/유한한/);
  });
});
