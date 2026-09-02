import { z, ZodError } from 'zod';
import {
  actorFromHeaders,
  AuthenticationError,
} from '@/lib/auth/request-actor';
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
} from '@/lib/domain/contracts';
import { SourceFileConflictError } from '@/lib/files/storage';
import { getPrivateFileStorage } from '@/lib/files/r2-factory';
import { readBoundedBytes } from '@/lib/http/bounded-bytes';
import {
  assertSameSiteMutation,
  requestIdFrom,
  RequestBoundaryError,
  runtimeMode,
} from '@/lib/http/request-boundary';
import { D1SourcePackageRepository } from '@/lib/ingestion/d1-repository';
import {
  SourcePackageAccessError,
  SourceUploadStateError,
} from '@/lib/ingestion/repository';
import { SourceUploadService } from '@/lib/ingestion/upload-service';
import { SourceInspectionError } from '@/lib/imports/inspect-source-file';

const opaqueIdSchema = z.uuid();

type RouteContext = { params: Promise<{ uploadId: string }> };

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    assertSameSiteMutation(request.headers);
    const { uploadId: rawUploadId } = await context.params;
    const uploadId = opaqueIdSchema.parse(rawUploadId);
    const actor = actorFromHeaders(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const service = new SourceUploadService(
      new D1SourcePackageRepository(),
      getPrivateFileStorage(),
    );
    const data = await service.store(uploadId, actor, requestId, (maxBytes) =>
      readBoundedBytes(request, maxBytes),
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
  let message = '산출서와 집계표 파일을 안전하게 저장하지 못했습니다.';
  let details: unknown;
  if (error instanceof AuthenticationError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error instanceof SourcePackageAccessError) {
    status = 403;
    code = error.code;
    message = error.message;
  } else if (
    error instanceof SourceUploadStateError ||
    error instanceof SourceFileConflictError
  ) {
    status = 409;
    code = error.code;
    message = error.message;
  } else if (error instanceof SourceInspectionError) {
    status = error.code === 'FILE_TOO_LARGE' ? 413 : 400;
    code = error.code;
    message = error.message;
  } else if (error instanceof RequestBoundaryError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error instanceof ZodError) {
    status = 400;
    code = 'INVALID_INPUT';
    message = '업로드 식별자를 확인해 주세요.';
    details = z.treeifyError(error);
  }
  const body: ApiErrorEnvelope = {
    error: { code, message, requestId, ...(details ? { details } : {}) },
  };
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
  });
}
