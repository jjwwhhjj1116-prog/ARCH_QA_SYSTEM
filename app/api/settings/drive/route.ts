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
  runtimeMode,
} from '@/lib/http/request-boundary';
import { driveSettingsService } from '@/lib/files/drive-settings';
import { DriveError } from '@/lib/files/google-drive';
import { PersonalSettingsError } from '@/lib/server/ai/personal-settings';

export const dynamic = 'force-dynamic';
export async function handleDrive(request: Request, callback = false) {
  const headers = {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  };
  try {
    const url = new URL(request.url);
    const origin = process.env.APP_ORIGIN || url.origin;
    if (request.method !== 'GET') {
      // Company OAuth changes require an explicit Origin even in Sites mode.
      if (request.headers.get('origin') !== origin)
        throw new DriveError(
          'DRIVE_ORIGIN_DENIED',
          '다른 사이트에서 보낸 요청은 허용하지 않습니다.',
          403,
        );
      assertSameSiteMutation(request.headers, origin);
    }
    const actor = await authenticateRequest(request.headers, runtimeMode());
    const service = driveSettingsService(
      getD1Binding(),
      actor,
      process.env.AI_SETTINGS_ENCRYPTION_KEY,
      origin,
    );
    let data;
    if (callback) {
      if (url.searchParams.has('error'))
        throw new DriveError(
          'DRIVE_CONSENT_CANCELLED',
          'Google 연결이 취소되었습니다. 기존 연결은 유지됩니다.',
          400,
        );
      data = await service.complete(
        url.searchParams.get('state') ?? '',
        url.searchParams.get('code') ?? '',
      );
      return new Response(null, {
        status: 303,
        headers: {
          ...headers,
          Location: `${origin}/?view=settings&drive=connected`,
        },
      });
    } else if (request.method === 'GET') data = await service.status();
    else if (request.method === 'PUT')
      data = await service.save(await readJson(request));
    else {
      const input = z
        .object({
          action: z.enum(['connect', 'check']),
          version: z.number().int().nonnegative(),
        })
        .strict()
        .parse(await readJson(request));
      data =
        input.action === 'connect'
          ? await service.start(input.version)
          : await service.check();
    }
    return Response.json({ data }, { headers });
  } catch (error) {
    let status = 500,
      code = 'DRIVE_SETTINGS_FAILED',
      message = 'Drive 설정을 처리하지 못했습니다. 다시 확인해 주세요.';
    if (
      error instanceof DriveError ||
      error instanceof AuthenticationError ||
      error instanceof RequestBoundaryError ||
      error instanceof PersonalSettingsError
    )
      ({ status, code, message } = error);
    else if (error instanceof z.ZodError) {
      status = 400;
      code = 'VALIDATION_FAILED';
      message = '이메일·클라이언트 ID·보안 비밀번호를 확인해 주세요.';
    }
    if (callback) {
      // Text only: never render provider-supplied parameters or raw errors.
      return new Response(
        `${message}\n설정 화면으로 돌아가 다시 연결해 주세요.`,
        {
          status,
          headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
        },
      );
    }
    return Response.json({ error: { code, message } }, { status, headers });
  }
}
export const GET = (request: Request) => handleDrive(request);
export const PUT = GET;
export const POST = GET;
