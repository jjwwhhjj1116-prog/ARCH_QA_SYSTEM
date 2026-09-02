import {
  actorFromHeaders,
  AuthenticationError,
} from '@/lib/auth/request-actor';
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
} from '@/lib/domain/contracts';
import { requestIdFrom, runtimeMode } from '@/lib/http/request-boundary';
import { getGeminiConfigurationStatus } from '@/lib/server/ai/gemini-config';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    actorFromHeaders(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const body: ApiSuccessEnvelope<
      ReturnType<typeof getGeminiConfigurationStatus>
    > = {
      data: getGeminiConfigurationStatus(),
      requestId,
    };
    return Response.json(body, {
      status: 200,
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    });
  } catch (error) {
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'AI 설정 상태를 확인하지 못했습니다.';
    if (error instanceof AuthenticationError) {
      status = error.status;
      code = error.code;
      message = error.message;
    }
    const body: ApiErrorEnvelope = {
      error: { code, message, requestId },
    };
    return Response.json(body, {
      status,
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    });
  }
}
