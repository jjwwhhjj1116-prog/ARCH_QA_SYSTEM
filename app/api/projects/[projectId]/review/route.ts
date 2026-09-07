import { ZodError, z } from 'zod';
import {
  actorFromHeaders,
  AuthenticationError,
} from '@/lib/auth/request-actor';
import {
  assertSameSiteMutation,
  readJson,
  requestIdFrom,
  RequestBoundaryError,
  runtimeMode,
} from '@/lib/http/request-boundary';
import { ReviewService, reviewRequestSchema } from '@/lib/review/server';
import { WorkbookError } from '@/lib/review/workbook';
import { ReviewLimitError } from '@/lib/review/engine';
import { exportReview } from '@/lib/review/report';

type Context = { params: Promise<{ projectId: string }> };
async function respond(
  request: Request,
  context: Context,
  write: boolean,
): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  const headers = { 'cache-control': 'no-store', 'x-request-id': requestId };
  try {
    if (write) assertSameSiteMutation(request.headers);
    const actor = actorFromHeaders(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const { projectId } = await context.params;
    z.uuid().parse(projectId);
    const service = new ReviewService();
    let data: unknown;
    if (write)
      data = await service.mutate(
        actor,
        projectId,
        reviewRequestSchema.parse(await readJson(request)),
        requestId,
      );
    else {
      const url = new URL(request.url);
      const caseId = z.uuid().parse(url.searchParams.get('caseId'));
      const runId = url.searchParams.get('runId');
      if (url.searchParams.get('format') === 'xlsx') {
        const detail = await service.runDetail(
          actor,
          projectId,
          caseId,
          z.uuid().parse(runId),
        );
        const bytes = exportReview(detail.run, detail.decisions);
        return new Response(bytes as BodyInit, {
          headers: {
            ...headers,
            'content-type':
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'content-disposition': `attachment; filename="CONCOST_QC_${detail.run.id.slice(0, 8)}.xlsx"`,
            'x-content-type-options': 'nosniff',
          },
        });
      }
      data = runId
        ? await service.runDetail(
            actor,
            projectId,
            caseId,
            z.uuid().parse(runId),
          )
        : await service.state(actor, projectId, caseId);
    }
    return Response.json({ data, requestId }, { headers });
  } catch (error) {
    if (error instanceof ReviewLimitError)
      return Response.json(
        {
          error: {
            code: 'REVIEW_EVIDENCE_LIMIT',
            message: error.message,
            requestId,
          },
        },
        { status: 413, headers },
      );
    const conflict =
      error instanceof Error && /MAPPING_CONFLICT/.test(error.message);
    const permission =
      error instanceof Error && /QC_PERMISSION_CHANGED/.test(error.message);
    if (conflict || permission)
      return Response.json(
        {
          error: {
            code: conflict ? 'MAPPING_CONFLICT' : 'QC_PERMISSION_CHANGED',
            message: conflict
              ? '다른 창에서 매핑을 변경했습니다. 새로 확인한 뒤 저장해 주세요.'
              : '저장 중 권한이 변경되었습니다. 프로젝트 접근 권한을 확인해 주세요.',
            requestId,
          },
        },
        { status: conflict ? 409 : 403, headers },
      );
    const known =
      error instanceof AuthenticationError ||
      error instanceof RequestBoundaryError;
    const status = known
      ? error.status
      : error instanceof ZodError
        ? 400
        : error instanceof WorkbookError
          ? 422
          : 500;
    return Response.json(
      {
        error: {
          code: known
            ? error.code
            : error instanceof WorkbookError
              ? error.code
              : status === 400
                ? 'INVALID_REVIEW_INPUT'
                : 'REVIEW_REQUEST_FAILED',
          message:
            known || error instanceof WorkbookError
              ? error.message
              : status === 400
                ? '검수 입력과 조건을 확인해 주세요.'
                : '검수 요청을 저장하지 못했습니다. 실행 이력을 새로 확인한 뒤 다시 시도해 주세요.',
          requestId,
        },
      },
      { status, headers },
    );
  }
}
export const GET = (request: Request, context: Context) =>
  respond(request, context, false);
export const POST = (request: Request, context: Context) =>
  respond(request, context, true);
