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
import { drawingAttachments } from '@/lib/ingestion/drawing-attachments';
import { SourcePackageAccessError } from '@/lib/ingestion/repository';
import { DriveError } from '@/lib/files/google-drive';
type Context = { params: Promise<{ projectId: string; caseId: string }> };
async function handle(request: Request, context: Context) {
  const requestId = requestIdFrom(request.headers);
  const headers = { 'cache-control': 'no-store', 'x-request-id': requestId };
  try {
    if (request.method === 'POST')
      assertSameSiteMutation(request.headers, new URL(request.url).origin);
    const { projectId, caseId } = z
      .object({ projectId: z.uuid(), caseId: z.uuid() })
      .parse(await context.params);
    const actor = await authenticateRequest(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    if (process.env.FILE_STORAGE_PROVIDER !== 'google-drive')
      throw new DriveError(
        'TRANSFER_UNAVAILABLE',
        '회사 Drive 저장소에서 지원되는 기능입니다.',
        409,
      );
    const service = drawingAttachments(
      getD1Binding(),
      projectId,
      caseId,
      actor,
    );
    let data;
    if (request.method === 'GET') data = await service.list();
    else {
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new RequestBoundaryError(
          415,
          'JSON_REQUIRED',
          'JSON 입력이 필요합니다.',
        );
      const reader = request.body?.getReader();
      if (!reader)
        throw new RequestBoundaryError(
          400,
          'INVALID_INPUT',
          '파일 정보가 없습니다.',
        );
      let text = '',
        size = 0;
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 4096) {
            await reader.cancel();
            throw new RequestBoundaryError(
              413,
              'BODY_TOO_LARGE',
              '파일 정보가 너무 큽니다.',
            );
          }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
      data = await service.create(
        JSON.parse(text),
        request.headers.get('idempotency-key') ?? '',
        requestId,
      );
    }
    return Response.json({ data, requestId }, { headers });
  } catch (error) {
    let status = 500,
      code = 'INTERNAL_ERROR',
      message = '첨부 기록을 확인하지 못했습니다.';
    if (
      error instanceof AuthenticationError ||
      error instanceof DriveError ||
      error instanceof RequestBoundaryError
    )
      ({ status, code, message } = error);
    else if (error instanceof SourcePackageAccessError) {
      status = 403;
      code = error.code;
      message = error.message;
    } else if (error instanceof z.ZodError || error instanceof SyntaxError) {
      status = 400;
      code = 'INVALID_INPUT';
      message = '파일 이름·크기·형식을 확인해 주세요.';
    }
    return Response.json(
      { error: { code, message, requestId } },
      { status, headers },
    );
  }
}
export const GET = handle;
export const POST = handle;
