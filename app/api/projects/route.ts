import { z, ZodError } from 'zod';
import {
  actorFromHeaders,
  AuthenticationError,
} from '@/lib/auth/request-actor';
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  CreateProjectInput,
} from '@/lib/domain/contracts';
import { D1ProjectRepository } from '@/lib/projects/d1-repository';
import { ProjectConflictError } from '@/lib/projects/repository';
import { ProjectService } from '@/lib/projects/service';
import {
  assertSameSiteMutation,
  readJson,
  requestIdFrom,
  RequestBoundaryError,
  runtimeMode,
} from '@/lib/http/request-boundary';

const service = new ProjectService(new D1ProjectRepository());

export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    const actor = actorFromHeaders(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const projects = await service.list(actor);
    return success(projects, requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    assertSameSiteMutation(request.headers);
    const actor = actorFromHeaders(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const input = (await readJson(request)) as CreateProjectInput;
    const project = await service.create(actor, input, requestId);
    return success(project, requestId, 201);
  } catch (error) {
    return failure(error, requestId);
  }
}

function success<T>(data: T, requestId: string, status = 200): Response {
  const body: ApiSuccessEnvelope<T> = { data, requestId };
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
  });
}

function failure(error: unknown, requestId: string): Response {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = '요청을 처리하지 못했습니다. 다시 시도해 주세요.';
  let details: unknown;
  if (error instanceof AuthenticationError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error instanceof ProjectConflictError) {
    status = 409;
    code = error.code;
    message = error.message;
  } else if (error instanceof ZodError) {
    status = 400;
    code = 'INVALID_INPUT';
    message = '입력값을 확인해 주세요.';
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
