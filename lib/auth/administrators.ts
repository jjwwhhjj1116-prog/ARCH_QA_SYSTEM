// Application administration is independent of project ownership.
export const ADMIN_EMAILS = [
  'yjw@con-cost.com',
  'yjpark@con-cost.com',
] as const;
export function isApplicationAdmin(email: string): boolean {
  return (ADMIN_EMAILS as readonly string[]).includes(
    email.trim().toLowerCase(),
  );
}
