import { z } from 'zod';
import { getD1Binding } from '@/db';
import {
  authenticateRequest,
  AuthenticationError,
} from '@/lib/auth/request-actor';
import {
  assertSameSiteMutation,
  requestIdFrom,
  runtimeMode,
  RequestBoundaryError,
} from '@/lib/http/request-boundary';
import { readBoundedBytes } from '@/lib/http/bounded-bytes';
import { DriveTransferService } from '@/lib/ingestion/drive-transfer-service';
import { DriveError } from '@/lib/files/google-drive';
import {
  SourcePackageAccessError,
  SourceUploadStateError,
} from '@/lib/ingestion/repository';
import { SourceInspectionError } from '@/lib/imports/inspect-source-file';

type Context = { params: Promise<{ uploadId: string }> };
async function handle(request: Request, context: Context) {
  const requestId = requestIdFrom(request.headers);
  const headers = { 'cache-control': 'no-store', 'x-request-id': requestId };
  try {
    if (request.method !== 'GET')
      assertSameSiteMutation(request.headers, new URL(request.url).origin);
    const id = z.uuid().safeParse((await context.params).uploadId);
    if (!id.success)
      throw new RequestBoundaryError(
        400,
        'INVALID_INPUT',
        '파일 식별자를 확인해 주세요.',
      );
    const actor = await authenticateRequest(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    if (process.env.FILE_STORAGE_PROVIDER !== 'google-drive')
      throw new DriveError(
        'TRANSFER_UNAVAILABLE',
        '이어 올리기를 지원하지 않는 저장소입니다.',
        409,
      );
    const service = new DriveTransferService(
      getD1Binding(),
      process.env.AI_SETTINGS_ENCRYPTION_KEY,
    );
    let offset = 0;
    if (request.method === 'PUT') {
      const raw = request.headers.get('upload-offset');
      if (!raw || !/^(0|[1-9]\d{0,9})$/u.test(raw))
        throw new RequestBoundaryError(
          400,
          'INVALID_OFFSET',
          '전송 위치를 확인해 주세요.',
        );
      offset = Number(raw);
    }
    const data =
      request.method === 'GET'
        ? await service.status(id.data, actor)
        : await service.advance(
            id.data,
            actor,
            requestId,
            request.method === 'PUT'
              ? { offset, read: (limit) => readBoundedBytes(request, limit) }
              : undefined,
            request.headers.get('upload-sha256') ?? undefined,
          );
    return Response.json({ data, requestId }, { headers });
  } catch (error) {
    let status = 500,
      code = 'INTERNAL_ERROR',
      message = '원본 전송 상태를 확인하지 못했습니다. 다시 이어 올려 주세요.';
    if (
      error instanceof DriveError ||
      error instanceof RequestBoundaryError ||
      error instanceof AuthenticationError
    ) {
      ({ status, code, message } = error);
    } else if (
      error instanceof SourcePackageAccessError ||
      error instanceof SourceUploadStateError ||
      error instanceof SourceInspectionError
    ) {
      status =
        error instanceof SourcePackageAccessError
          ? 403
          : error instanceof SourceUploadStateError
            ? 409
            : 400;
      ({ code, message } = error);
    }
    return Response.json(
      { error: { code, message, requestId } },
      { status, headers },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
