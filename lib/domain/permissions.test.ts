import { describe, expect, it } from 'vitest';
import { can, canApproveReport } from './permissions';

describe('project permissions', () => {
  it('keeps viewers read-only', () => {
    expect(can('viewer', 'project:read')).toBe(true);
    expect(can('viewer', 'source:upload')).toBe(false);
    expect(can('viewer', 'report:approve')).toBe(false);
    expect(can('viewer', 'case:create')).toBe(false);
  });

  it('allows only working review roles to create a case', () => {
    expect(can('workspace_admin', 'case:create')).toBe(true);
    expect(can('project_owner', 'case:create')).toBe(true);
    expect(can('reviewer', 'case:create')).toBe(true);
    expect(can('approver', 'case:create')).toBe(false);
  });

  it('blocks self approval even for an approver', () => {
    expect(
      canApproveReport({
        role: 'approver',
        actorId: 'u1',
        reportAuthorId: 'u1',
      }),
    ).toBe(false);
    expect(
      canApproveReport({
        role: 'approver',
        actorId: 'u2',
        reportAuthorId: 'u1',
      }),
    ).toBe(true);
  });
});
