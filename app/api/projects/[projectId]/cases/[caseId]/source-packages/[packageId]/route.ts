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
  requestIdFrom,
  RequestBoundaryError,
  runtimeMode,
} from '@/lib/http/request-boundary';
import { D1SourcePackageRepository } from '@/lib/ingestion/d1-repository';
import {
  SourcePackageAccessError,
  SourcePackageConflictError,
} from '@/lib/ingestion/repository';
import { SourcePackageService } from '@/lib/ingestion/service';

const service = new SourcePackageService(new D1SourcePackageRepository());
const opaqueIdSchema = z.uuid();
const versionSchema = z.coerce.number().int().min(1);

type RouteContext = {
  params: Promise<{
    projectId: string;
    caseId: string;
    packageId: string;
  }>;
};

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    assertSameSiteMutation(request.headers);
    const params = await context.params;
    const projectId = opaqueIdSchema.parse(params.projectId);
    const caseId = opaqueIdSchema.parse(params.caseId);
    const packageId = opaqueIdSchema.parse(params.packageId);
    const expectedVersion = versionSchema.parse(
      request.headers.get('if-match')?.replaceAll('"', ''),
    );
    const actor = actorFromHeaders(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const data = await service.archive(
      projectId,
      caseId,
      packageId,
      expectedVersion,
      actor,
      requestId,
    );
    const body: ApiSuccessEnvelope<typeof data> = { data, requestId };
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
  let message = '등록 자료 묶음을 삭제하지 못했습니다.';
  let details: unknown;
  if (error instanceof AuthenticationError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error instanceof SourcePackageAccessError) {
    status = 403;
    code = error.code;
    message = error.message;
  } else if (error instanceof SourcePackageConflictError) {
    status = 409;
    code = error.code;
    message = error.message;
  } else if (error instanceof ZodError) {
    status = 400;
    code = 'INVALID_INPUT';
    message = '삭제할 등록 자료 묶음 정보를 확인해 주세요.';
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
