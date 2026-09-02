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
import {
  GeminiConfigurationError,
  GeminiConnectionError,
  testGeminiConnection,
} from '@/lib/server/ai/gemini-config';

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    assertSameSiteMutation(request.headers);
    actorFromHeaders(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const result = await testGeminiConnection();
    const body: ApiSuccessEnvelope<typeof result> = {
      data: result,
      requestId,
    };
    return Response.json(body, {
      status: 200,
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    });
  } catch (error) {
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Gemini 연결을 확인하지 못했습니다.';
    if (error instanceof AuthenticationError) {
      status = error.status;
      code = error.code;
      message = error.message;
    } else if (error instanceof GeminiConfigurationError) {
      status = 503;
      code = error.code;
      message = error.message;
    } else if (error instanceof GeminiConnectionError) {
      status = error.status;
      code = error.code;
      message = error.message;
    } else if (error instanceof RequestBoundaryError) {
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
