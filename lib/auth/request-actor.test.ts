import { describe, expect, it } from 'vitest';
import { actorFromHeaders, AuthenticationError } from './request-actor';

describe('request actor', () => {
  it('fails closed in production without workspace headers', () => {
    expect(() => actorFromHeaders(new Headers(), 'production')).toThrow(
      AuthenticationError,
    );
  });

  it('uses the local actor only with an explicit development opt-in', () => {
    expect(() => actorFromHeaders(new Headers(), 'development')).toThrow(
      AuthenticationError,
    );
    expect(
      actorFromHeaders(new Headers(), 'development', {
        allowDevelopmentMock: true,
      }).source,
    ).toBe('development_mock');
  });

  it('decodes a workspace display name safely', () => {
    const headers = new Headers({
      'oai-authenticated-user-id': 'user-1',
      'oai-authenticated-user-email': 'reviewer@example.com',
      'oai-authenticated-user-full-name': encodeURIComponent('김 검수'),
      'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
    });
    expect(
      actorFromHeaders(headers, 'production', {
        allowedEmails: 'reviewer@example.com',
      }),
    ).toMatchObject({
      id: 'user-1',
      displayName: '김 검수',
      source: 'workspace',
    });
  });

  it('rejects an authenticated but unapproved production account', () => {
    const headers = new Headers({
      'oai-authenticated-user-id': 'user-1',
      'oai-authenticated-user-email': 'other@example.com',
    });
    expect(() =>
      actorFromHeaders(headers, 'production', {
        allowedEmails: 'jjwwhhjj1116@gmail.com',
      }),
    ).toThrow(expect.objectContaining({ code: 'ACCOUNT_NOT_ALLOWED' }));
  });

  it('rejects malformed or oversized workspace identity headers', () => {
    const headers = new Headers({
      'oai-authenticated-user-id': 'user-1',
      'oai-authenticated-user-email': 'not-an-email',
    });
    expect(() => actorFromHeaders(headers, 'production')).toThrow(
      AuthenticationError,
    );
  });
});
