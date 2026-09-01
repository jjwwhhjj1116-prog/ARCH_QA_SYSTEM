import { z } from 'zod';

export const projectRoleSchema = z.enum([
  'workspace_admin',
  'project_owner',
  'reviewer',
  'approver',
  'viewer',
]);

export type ProjectRole = z.infer<typeof projectRoleSchema>;

export type Actor = {
  id: string;
  email: string;
  displayName: string;
  source: 'workspace' | 'development_mock';
};

export const createProjectSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, '프로젝트 코드는 2자 이상이어야 합니다.')
    .max(40)
    .optional(),
  name: z
    .string()
    .trim()
    .min(2, '프로젝트명은 2자 이상이어야 합니다.')
    .max(120),
  clientName: z.string().trim().max(120).optional().default(''),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export type ProjectSummary = {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  status: 'active' | 'archived';
  role: ProjectRole;
  openCaseCount: number;
  needsAttentionCount: number;
  createdAt: string;
};

export const createReviewCaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  discipline: z.enum(['FIN', 'RC']),
});

export type CreateReviewCaseInput = z.infer<typeof createReviewCaseSchema>;

export type ReviewCaseSummary = {
  id: string;
  projectId: string;
  name: string;
  discipline: 'FIN' | 'RC';
  status:
    | 'draft'
    | 'ready'
    | 'reviewing'
    | 'needs_attention'
    | 'awaiting_approval'
    | 'approved'
    | 'archived';
  ownerId: string;
  createdAt: string;
};

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
};

export type ApiSuccessEnvelope<T> = { data: T; requestId: string };
