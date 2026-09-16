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
import { companySettings } from '@/lib/server/ai/company-settings';
import { regionalGeminiFetch } from '@/lib/server/ai/regional-fetch';
import {
  personalSettingsInput,
  personalModelsInput,
  PersonalSettingsError,
} from '@/lib/server/ai/personal-settings';
import {
  GeminiConnectionError,
  GeminiConfigurationError,
} from '@/lib/server/ai/gemini-config';

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
    const service = companySettings(
      getD1Binding(),
      actor,
      process.env.AI_SETTINGS_ENCRYPTION_KEY,
      regionalGeminiFetch,
    );
    let data;
    if (request.method === 'GET') data = await service.status();
    else {
      const body = await readJson(request);
      if (request.method === 'PUT')
        data = await service.save(personalSettingsInput.parse(body));
      else if (request.method === 'POST')
        data =
          body &&
          typeof body === 'object' &&
          'action' in body &&
          body.action === 'probe-generation'
            ? await service.probe(
                z
                  .object({
                    action: z.literal('probe-generation'),
                    version: z.number().int().nonnegative(),
                  })
                  .strict()
                  .parse(body).version,
              )
            : await service.models(personalModelsInput.parse(body));
      else if (request.method === 'PATCH')
        data = await service.promotePersonal(
          z
            .object({
              action: z.literal('promote-personal'),
              version: z.number().int().nonnegative(),
            })
            .strict()
            .parse(body).version,
        );
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
      message = '회사 API 설정을 처리하지 못했습니다.';
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
      message = '키·모델·요청 형식을 확인해 주세요.';
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
export const PATCH = handle;
export const DELETE = handle;
