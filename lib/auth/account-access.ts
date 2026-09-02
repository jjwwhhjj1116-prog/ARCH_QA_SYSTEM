import { z } from 'zod';

const emailSchema = z.email().max(254);

export class AccountAccessError extends Error {
  constructor(
    message: string,
    readonly code: 'ACCOUNT_NOT_ALLOWED' | 'ACCESS_POLICY_UNAVAILABLE',
    readonly status: 403 | 503,
  ) {
    super(message);
  }
}

export function assertAccountAllowed(
  email: string,
  configuredEmails: string | undefined,
  runtime: 'production' | 'development' | 'test',
): void {
  const normalizedEmail = normalizeEmail(email);
  const allowedEmails = parseAllowedEmails(configuredEmails);

  if (allowedEmails.size === 0) {
    if (runtime !== 'production') return;
    throw new AccountAccessError(
      '승인 계정 정책을 불러오지 못했습니다. 관리자에게 문의해 주세요.',
      'ACCESS_POLICY_UNAVAILABLE',
      503,
    );
  }

  if (!allowedEmails.has(normalizedEmail)) {
    throw new AccountAccessError(
      '이 계정은 CONCOST 기술본부 QC 스튜디오 사용 승인을 받지 않았습니다.',
      'ACCOUNT_NOT_ALLOWED',
      403,
    );
  }
}

export function parseAllowedEmails(value: string | undefined): Set<string> {
  const emails = new Set<string>();
  for (const candidate of value?.split(',') ?? []) {
    const normalized = candidate.trim().toLocaleLowerCase('en-US');
    if (!normalized) continue;
    const parsed = emailSchema.safeParse(normalized);
    if (!parsed.success) return new Set();
    emails.add(parsed.data);
  }
  return emails;
}

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLocaleLowerCase('en-US');
  const parsed = emailSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new AccountAccessError(
      '인증 계정 정보가 올바르지 않습니다.',
      'ACCOUNT_NOT_ALLOWED',
      403,
    );
  }
  return parsed.data;
}
