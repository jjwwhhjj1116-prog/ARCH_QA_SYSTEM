import { z, ZodError } from 'zod';
import {
  actorFromHeaders,
  AuthenticationError,
} from '@/lib/auth/request-actor';
import { D1ReviewCaseRepository } from '@/lib/cases/d1-repository';
import { CaseAccessError } from '@/lib/cases/repository';
import { ReviewCaseService } from '@/lib/cases/service';
import {
  assertSameSiteMutation,
  readJson,
  requestIdFrom,
  RequestBoundaryError,
  runtimeMode,
} from '@/lib/http/request-boundary';
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  CreateReviewCaseInput,
} from '@/lib/domain/contracts';

const service = new ReviewCaseService(new D1ReviewCaseRepository());
const projectIdSchema = z.uuid();

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    const { projectId: rawProjectId } = await context.params;
    const projectId = projectIdSchema.parse(rawProjectId);
    const actor = actorFromHeaders(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    return success(await service.list(projectId, actor), requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    assertSameSiteMutation(request.headers);
    const { projectId: rawProjectId } = await context.params;
    const projectId = projectIdSchema.parse(rawProjectId);
    const actor = actorFromHeaders(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const input = (await readJson(request)) as CreateReviewCaseInput;
    return success(
      await service.create(projectId, actor, input, requestId),
      requestId,
      201,
    );
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
  let message = '검수 케이스 요청을 처리하지 못했습니다.';
  let details: unknown;
  if (error instanceof AuthenticationError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error instanceof CaseAccessError) {
    status = 403;
    code = error.code;
    message = error.message;
  } else if (error instanceof ZodError) {
    status = 400;
    code = 'INVALID_INPUT';
    message = '검수 케이스 입력값을 확인해 주세요.';
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
