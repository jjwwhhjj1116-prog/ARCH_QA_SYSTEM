import type { ProjectRole } from './contracts';

export type ProjectAction =
  | 'project:read'
  | 'project:update'
  | 'case:create'
  | 'source:upload'
  | 'review:run'
  | 'finding:triage'
  | 'report:approve'
  | 'member:manage';

const grants: Record<ProjectRole, ReadonlySet<ProjectAction>> = {
  workspace_admin: new Set([
    'project:read',
    'project:update',
    'case:create',
    'source:upload',
    'review:run',
    'finding:triage',
    'report:approve',
    'member:manage',
  ]),
  project_owner: new Set([
    'project:read',
    'project:update',
    'case:create',
    'source:upload',
    'review:run',
    'finding:triage',
    'member:manage',
  ]),
  reviewer: new Set([
    'project:read',
    'case:create',
    'source:upload',
    'review:run',
    'finding:triage',
  ]),
  approver: new Set(['project:read', 'finding:triage', 'report:approve']),
  viewer: new Set(['project:read']),
};

export function can(role: ProjectRole, action: ProjectAction): boolean {
  return grants[role].has(action);
}

export function canApproveReport(input: {
  role: ProjectRole;
  actorId: string;
  reportAuthorId: string;
}): boolean {
  return (
    can(input.role, 'report:approve') && input.actorId !== input.reportAuthorId
  );
}
