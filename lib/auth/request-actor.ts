import { z } from 'zod';
import type { Actor } from '@/lib/domain/contracts';
import { AccountAccessError, assertAccountAllowed } from './account-access';

const USER_ID_HEADER = 'oai-authenticated-user-id';
const USER_EMAIL_HEADER = 'oai-authenticated-user-email';
const USER_FULL_NAME_HEADER = 'oai-authenticated-user-full-name';
const USER_FULL_NAME_ENCODING_HEADER =
  'oai-authenticated-user-full-name-encoding';

export class AuthenticationError extends Error {
  constructor(
    message: string,
    readonly code = 'AUTHENTICATION_REQUIRED',
    readonly status = 401,
  ) {
    super(message);
  }
}

const workspaceActorSchema = z.object({
  id: z.string().trim().min(1).max(200),
  email: z.email().max(254),
  displayName: z.string().trim().min(1).max(200),
});

export function actorFromHeaders(
  headers: Headers,
  runtime: 'production' | 'development' | 'test',
  options: { allowDevelopmentMock?: boolean; allowedEmails?: string } = {},
): Actor {
  const id = headers.get(USER_ID_HEADER);
  const email = headers.get(USER_EMAIL_HEADER);
  if (id && email) {
    const encodedName = headers.get(USER_FULL_NAME_HEADER);
    const displayName =
      encodedName &&
      headers.get(USER_FULL_NAME_ENCODING_HEADER) === 'percent-encoded-utf-8'
        ? (safeDecode(encodedName) ?? email)
        : email;
    const actor = workspaceActorSchema.safeParse({ id, email, displayName });
    if (!actor.success) {
      throw new AuthenticationError('인증 사용자 정보가 올바르지 않습니다.');
    }
    try {
      assertAccountAllowed(
        actor.data.email,
        options.allowedEmails ?? process.env.APP_ALLOWED_EMAILS,
        runtime,
      );
    } catch (error) {
      if (error instanceof AccountAccessError) {
        throw new AuthenticationError(error.message, error.code, error.status);
      }
      throw error;
    }
    return { ...actor.data, source: 'workspace' };
  }
  if (runtime !== 'production' && options.allowDevelopmentMock === true) {
    return {
      id: 'local-user-owner',
      email: 'local-reviewer@concost.invalid',
      displayName: '로컬 검수자',
      source: 'development_mock',
    };
  }
  throw new AuthenticationError(
    '인증된 워크스페이스 사용자만 접근할 수 있습니다.',
  );
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
