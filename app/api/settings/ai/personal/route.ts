import { z } from 'zod';
import { getD1Binding } from '@/db';
import {
  authenticateRequest,
  AuthenticationError,
} from '@/lib/auth/request-actor';
import {
  assertSameSiteMutation,
  readJson,
  RequestBoundaryError,
  requestIdFrom,
  runtimeMode,
} from '@/lib/http/request-boundary';
import {
  GeminiConnectionError,
  GeminiConfigurationError,
} from '@/lib/server/ai/gemini-config';
import {
  personalSettings,
  personalSettingsInput,
  PersonalSettingsError,
} from '@/lib/server/ai/personal-settings';

export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  const requestId = requestIdFrom(request.headers);
  const headers = { 'cache-control': 'no-store', 'x-request-id': requestId };
  try {
    if (request.method !== 'GET')
      assertSameSiteMutation(request.headers, new URL(request.url).origin);
    const actor = await authenticateRequest(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const service = personalSettings(
      getD1Binding(),
      actor.id,
      process.env.AI_SETTINGS_ENCRYPTION_KEY,
    );
    let data;
    if (request.method === 'GET') data = await service.status();
    else {
      const body = await readJson(request);
      if (request.method === 'PUT')
        data = await service.save(personalSettingsInput.parse(body));
      else
        data = await service.disconnect(
          z
            .object({
              version: z.number().int().nonnegative(),
              confirm: z.literal(true),
            })
            .strict()
            .parse(body).version,
        );
    }
    return Response.json({ data, requestId }, { headers });
  } catch (error) {
    let status = 500,
      code = 'INTERNAL_ERROR',
      message = '설정을 처리하지 못했습니다. 잠시 후 새로 확인해 주세요.';
    if (
      error instanceof AuthenticationError ||
      error instanceof RequestBoundaryError ||
      error instanceof PersonalSettingsError ||
      error instanceof GeminiConnectionError
    )
      ({ status, code, message } = error);
    else if (error instanceof z.ZodError) {
      status = 400;
      code = 'VALIDATION_FAILED';
      message = 'API 키와 선택한 모델을 확인해 주세요.';
    } else if (error instanceof GeminiConfigurationError) {
      status = 400;
      code = error.code;
      message = error.message;
    }
    return Response.json(
      { error: { code, message, requestId } },
      { status, headers },
    );
  }
}
export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
