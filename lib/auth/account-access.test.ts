import { describe, expect, it } from 'vitest';
import {
  AccountAccessError,
  assertAccountAllowed,
  parseAllowedEmails,
} from './account-access';

describe('account access policy', () => {
  it('normalizes exact approved email matches', () => {
    expect(() =>
      assertAccountAllowed(
        ' JJWWHHJJ1116@GMAIL.COM ',
        'jjwwhhjj1116@gmail.com',
        'production',
      ),
    ).not.toThrow();
  });

  it('rejects suffix and lookalike account attacks', () => {
    for (const email of [
      'jjwwhhjj1116@gmail.com.attacker.test',
      'jjwwhhjj1116+other@gmail.com',
      'jjwwhhjj1116@googlemail.com',
    ]) {
      expect(() =>
        assertAccountAllowed(email, 'jjwwhhjj1116@gmail.com', 'production'),
      ).toThrow(AccountAccessError);
    }
  });

  it('fails closed for a missing or malformed production policy', () => {
    for (const policy of [undefined, '', 'not-an-email']) {
      expect(() =>
        assertAccountAllowed('jjwwhhjj1116@gmail.com', policy, 'production'),
      ).toThrow(expect.objectContaining({ code: 'ACCESS_POLICY_UNAVAILABLE' }));
    }
  });

  it('allows an unconfigured non-production policy for local tooling only', () => {
    expect(() =>
      assertAccountAllowed('developer@example.test', undefined, 'test'),
    ).not.toThrow();
    expect(parseAllowedEmails(' a@example.com, B@example.com ')).toEqual(
      new Set(['a@example.com', 'b@example.com']),
    );
  });
});
