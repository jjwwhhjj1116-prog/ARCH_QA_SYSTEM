import { z } from 'zod';
import { getD1Binding } from '@/db';
import {
  authenticateRequest,
  AuthenticationError,
} from '@/lib/auth/request-actor';
import { requestIdFrom, runtimeMode } from '@/lib/http/request-boundary';
import { DriveTransferService } from '@/lib/ingestion/drive-transfer-service';
import { SourcePackageAccessError } from '@/lib/ingestion/repository';
import { DriveError } from '@/lib/files/google-drive';
export async function GET(
  request: Request,
  context: { params: Promise<{ uploadId: string }> },
) {
  const requestId = requestIdFrom(request.headers);
  try {
    const id = z.uuid().parse((await context.params).uploadId);
    const actor = await authenticateRequest(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const response = await new DriveTransferService(
      getD1Binding(),
      process.env.AI_SETTINGS_ENCRYPTION_KEY,
    ).original(id, actor, requestId, request.headers.get('range'));
    response.headers.set('x-request-id', requestId);
    return response;
  } catch (error) {
    const status =
      error instanceof AuthenticationError || error instanceof DriveError
        ? error.status
        : error instanceof SourcePackageAccessError
          ? 403
          : error instanceof z.ZodError
            ? 400
            : 500;
    const code =
      error instanceof AuthenticationError ||
      error instanceof DriveError ||
      error instanceof SourcePackageAccessError
        ? error.code
        : 'DOWNLOAD_FAILED';
    return Response.json(
      {
        error: {
          code,
          message: '원본 다운로드 권한 또는 저장 상태를 확인해 주세요.',
          requestId,
        },
      },
      {
        status,
        headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
      },
    );
  }
}
