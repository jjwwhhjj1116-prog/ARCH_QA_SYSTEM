import { z, ZodError } from 'zod';
import {
  actorFromHeaders,
  AuthenticationError,
} from '@/lib/auth/request-actor';
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
} from '@/lib/domain/contracts';
import {
  assertSameSiteMutation,
  readJson,
  requestIdFrom,
  RequestBoundaryError,
  runtimeMode,
} from '@/lib/http/request-boundary';
import { D1ProjectRepository } from '@/lib/projects/d1-repository';
import {
  ProjectAccessError,
  ProjectConfirmationError,
  ProjectConflictError,
  ProjectNotFoundError,
} from '@/lib/projects/repository';
import { ProjectService } from '@/lib/projects/service';

const service = new ProjectService(new D1ProjectRepository());
const opaqueIdSchema = z.uuid();

type RouteContext = { params: Promise<{ projectId: string }> };

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    assertSameSiteMutation(request.headers);
    const { projectId: rawProjectId } = await context.params;
    const projectId = opaqueIdSchema.parse(rawProjectId);
    const actor = actorFromHeaders(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const project = await service.archive(
      projectId,
      actor,
      await readJson(request),
      requestId,
    );
    const body: ApiSuccessEnvelope<
      typeof project & { deletionMode: 'archive' }
    > = {
      data: { ...project, deletionMode: 'archive' },
      requestId,
    };
    return Response.json(body, {
      status: 200,
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    });
  } catch (error) {
    return failure(error, requestId);
  }
}

function failure(error: unknown, requestId: string): Response {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = '프로젝트를 보관하지 못했습니다.';
  let details: unknown;
  if (error instanceof AuthenticationError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error instanceof ProjectAccessError) {
    status = 403;
    code = error.code;
    message = error.message;
  } else if (error instanceof ProjectNotFoundError) {
    status = 404;
    code = error.code;
    message = error.message;
  } else if (
    error instanceof ProjectConfirmationError ||
    error instanceof ProjectConflictError
  ) {
    status = 409;
    code = error.code;
    message = error.message;
  } else if (error instanceof ZodError) {
    status = 400;
    code = 'INVALID_INPUT';
    message = '프로젝트명 확인값을 입력해 주세요.';
    details = z.treeifyError(error);
  } else if (error instanceof RequestBoundaryError) {
    status = error.status;
    code = error.code;
    message = error.message;
  }
  const body: ApiErrorEnvelope = {
    error: { code, message, requestId, ...(details ? { details } : {}) },
  };
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
  });
}
