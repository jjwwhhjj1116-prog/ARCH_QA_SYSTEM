import { z } from 'zod';
import { AuthenticationError } from '@/lib/auth/request-actor';
import {
  employeeActor,
  changeEmployeePassword,
  employeeLoginEnabled,
  loginEmployee,
  logoutEmployee,
  sessionCookie,
} from '@/lib/auth/employee-server';
import { isApplicationAdmin } from '@/lib/auth/administrators';
import {
  assertSameSiteMutation,
  readJson,
  requestIdFrom,
  RequestBoundaryError,
} from '@/lib/http/request-boundary';

type Context = { params: Promise<{ action: string }> };
async function respond(request: Request, context: Context) {
  const requestId = requestIdFrom(request.headers);
  const headers = { 'cache-control': 'no-store', 'x-request-id': requestId };
  let passwordChange = false;
  try {
    if (!employeeLoginEnabled())
      throw new AuthenticationError(
        '직원 로그인이 아직 활성화되지 않았습니다.',
        'EMPLOYEE_LOGIN_DISABLED',
        503,
      );
    const { action } = await context.params;
    passwordChange = action === 'change-password';
    if (request.method === 'GET' && action === 'session') {
      const actor = await employeeActor(request.headers);
      return Response.json(
        {
          data: {
            displayName: actor.displayName,
            email: actor.email,
            isAdmin: isApplicationAdmin(actor.email),
          },
          requestId,
        },
        { headers },
      );
    }
    if (request.method !== 'POST')
      return new Response(null, { status: 405, headers });
    // Consume the bounded POST body before rejecting its origin. Workerd must
    // not carry an unread request stream into the next service request.
    const body = await readJson(request, 2048);
    assertSameSiteMutation(request.headers, new URL(request.url).origin);
    if (passwordChange) {
      const input = z
        .object({
          currentPassword: z.string().min(1).max(256),
          newPassword: z.string().min(12).max(128),
        })
        .strict()
        .parse(body);
      await changeEmployeePassword(
        input.currentPassword,
        input.newPassword,
        request,
        requestId,
      );
      return Response.json(
        { data: { changed: true }, requestId },
        {
          headers: { ...headers, 'set-cookie': sessionCookie('', 0) },
        },
      );
    }
    if (action === 'login') {
      const input = z
        .object({
          email: z.email().max(254),
          password: z.string().min(1).max(256),
        })
        .parse(body);
      const token = await loginEmployee(
        input.email,
        input.password,
        request,
        requestId,
      );
      return Response.json(
        { data: { signedIn: true }, requestId },
        { headers: { ...headers, 'set-cookie': sessionCookie(token) } },
      );
    }
    if (action === 'logout') {
      await logoutEmployee(request.headers);
      return Response.json(
        { data: { signedIn: false }, requestId },
        { headers: { ...headers, 'set-cookie': sessionCookie('', 0) } },
      );
    }
    return new Response(null, { status: 404, headers });
  } catch (error) {
    if (request.body && !request.bodyUsed) {
      await request.body.cancel().catch(() => undefined);
    }
    const known =
      error instanceof AuthenticationError ||
      error instanceof RequestBoundaryError;
    const status = known
      ? error.status
      : error instanceof z.ZodError
        ? 400
        : 503;
    return Response.json(
      {
        error: {
          code: known
            ? error.code
            : status === 400
              ? passwordChange
                ? 'INVALID_PASSWORD_INPUT'
                : 'INVALID_LOGIN_INPUT'
              : 'AUTH_UNAVAILABLE',
          message: known
            ? error.message
            : status === 400
              ? passwordChange
                ? '현재 비밀번호와 12~128자의 새 비밀번호를 입력해 주세요.'
                : '아이디와 비밀번호를 확인해 주세요.'
              : '로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
          requestId,
        },
      },
      { status, headers },
    );
  }
}
export const GET = respond;
export const POST = respond;
