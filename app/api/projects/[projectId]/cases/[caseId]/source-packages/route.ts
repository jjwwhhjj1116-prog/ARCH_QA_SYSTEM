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
import {
  FileStorageUnavailableError,
  getPrivateFileStorage,
} from '@/lib/files/r2-factory';
import {
  createSourcePackageSchema,
  idempotencyKeySchema,
} from '@/lib/ingestion/contracts';
import { D1SourcePackageRepository } from '@/lib/ingestion/d1-repository';
import {
  SourcePackageAccessError,
  SourcePackageConflictError,
} from '@/lib/ingestion/repository';
import { SourcePackageService } from '@/lib/ingestion/service';
import { SourceInspectionError } from '@/lib/imports/inspect-source-file';

const service = new SourcePackageService(new D1SourcePackageRepository());
const opaqueIdSchema = z.uuid();

type RouteContext = {
  params: Promise<{ projectId: string; caseId: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    const params = await context.params;
    const projectId = opaqueIdSchema.parse(params.projectId);
    const caseId = opaqueIdSchema.parse(params.caseId);
    const actor = actorFromHeaders(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const data = await service.list(projectId, caseId, actor);
    const body: ApiSuccessEnvelope<typeof data> = { data, requestId };
    return Response.json(body, {
      status: 200,
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    });
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
    const params = await context.params;
    const projectId = opaqueIdSchema.parse(params.projectId);
    const caseId = opaqueIdSchema.parse(params.caseId);
    const actor = actorFromHeaders(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const idempotencyKey = idempotencyKeySchema.parse(
      request.headers.get('idempotency-key'),
    );
    const input = createSourcePackageSchema.parse(await readJson(request));
    // Do not create D1 upload intents when the private byte store is unavailable.
    getPrivateFileStorage();
    const data = await service.create(
      projectId,
      caseId,
      actor,
      input,
      idempotencyKey,
      requestId,
    );
    const body: ApiSuccessEnvelope<typeof data> = { data, requestId };
    return Response.json(body, {
      status: 201,
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    });
  } catch (error) {
    return failure(error, requestId);
  }
}

function failure(error: unknown, requestId: string): Response {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = '산출서와 집계표 등록 준비를 완료하지 못했습니다.';
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
  } else if (error instanceof FileStorageUnavailableError) {
    status = 503;
    code = error.code;
    message = error.message;
  } else if (error instanceof SourceInspectionError) {
    status = error.code === 'FILE_TOO_LARGE' ? 413 : 400;
    code = error.code;
    message = error.message;
  } else if (error instanceof ZodError) {
    status = 400;
    code = 'INVALID_INPUT';
    message = '등록할 산출서와 집계표 정보를 확인해 주세요.';
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
