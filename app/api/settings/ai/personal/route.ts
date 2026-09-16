import { z } from 'zod';
import { getD1Binding } from '@/db';
import { isApplicationAdmin } from '@/lib/auth/administrators';
import { regionalGeminiFetch } from '@/lib/server/ai/regional-fetch';
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
  personalModelsInput,
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
    if (!isApplicationAdmin(actor.email))
      throw new AuthenticationError(
        '관리자만 API 설정에 접근할 수 있습니다.',
        'ADMIN_REQUIRED',
        403,
      );
    const service = personalSettings(
      getD1Binding(),
      actor.id,
      process.env.AI_SETTINGS_ENCRYPTION_KEY,
      undefined,
      regionalGeminiFetch,
    );
    let data;
    if (request.method === 'GET') data = await service.status();
    else {
      const body = await readJson(request);
      if (request.method === 'PUT')
        data = await service.save(personalSettingsInput.parse(body));
      else if (request.method === 'POST')
        data = await service.models(personalModelsInput.parse(body));
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
    const fields: Record<string, string> = {};
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
      for (const issue of error.issues) {
        const field = String(issue.path[0] ?? 'request');
        if (field === 'apiKey')
          fields.apiKey =
            '키는 20~512자의 공백 없는 문자열이어야 합니다. AQ. 형식도 지원합니다. 복사한 키의 앞뒤 따옴표와 중간 줄바꿈을 확인해 주세요.';
        else if (field === 'model')
          fields.model =
            '선택한 모델을 지원하지 않습니다. 설정을 새로 불러온 뒤 다시 선택해 주세요.';
        else if (field === 'version')
          fields.version =
            '저장 상태를 불러오지 못했습니다. 새로 확인을 누른 뒤 다시 저장해 주세요.';
        else
          fields.request =
            '요청 형식이 올바르지 않습니다. 설정을 새로 불러와 주세요.';
      }
      message = Object.values(fields).join(' ');
    } else if (error instanceof GeminiConfigurationError) {
      status = 400;
      code = error.code;
      message = error.message;
    }
    return Response.json(
      {
        error: {
          code,
          message,
          requestId,
          fields,
          ...(error instanceof GeminiConnectionError && error.diagnostic
            ? { diagnostic: error.diagnostic }
            : {}),
        },
      },
      { status, headers },
    );
  }
}
export const GET = handle;
export const PUT = handle;
export const POST = handle;
export const DELETE = handle;
