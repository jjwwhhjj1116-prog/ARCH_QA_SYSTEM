import {
  actorFromHeaders,
  AuthenticationError,
} from '@/lib/auth/request-actor';
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
} from '@/lib/domain/contracts';
import { requestIdFrom, runtimeMode } from '@/lib/http/request-boundary';
import { mem0ConfigurationStatus } from '@/lib/server/memory/mem0-rest';

export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    actorFromHeaders(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const body: ApiSuccessEnvelope<ReturnType<typeof mem0ConfigurationStatus>> =
      {
        data: mem0ConfigurationStatus(),
        requestId,
      };
    return Response.json(body, {
      status: 200,
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    });
  } catch (error) {
    const status = error instanceof AuthenticationError ? error.status : 500;
    const body: ApiErrorEnvelope = {
      error: {
        code:
          error instanceof AuthenticationError ? error.code : 'INTERNAL_ERROR',
        message:
          error instanceof AuthenticationError
            ? error.message
            : '공유 메모리 설정을 확인하지 못했습니다.',
        requestId,
      },
    };
    return Response.json(body, {
      status,
      headers: { 'x-request-id': requestId },
    });
  }
}
