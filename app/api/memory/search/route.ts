import { z, ZodError } from 'zod';
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
  readJson,
  requestIdFrom,
  RequestBoundaryError,
  runtimeMode,
} from '@/lib/http/request-boundary';
import { D1ProjectRepository } from '@/lib/projects/d1-repository';
import { ProjectService } from '@/lib/projects/service';
import {
  MemoryConfigurationError,
  MemoryProviderError,
  searchMem0,
} from '@/lib/server/memory/mem0-rest';

const service = new ProjectService(new D1ProjectRepository());
const inputSchema = z.object({
  projectId: z.uuid(),
  query: z.string().trim().min(2).max(500),
});

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request.headers);
  try {
    assertSameSiteMutation(request.headers);
    const actor = actorFromHeaders(request.headers, runtimeMode(), {
      allowDevelopmentMock: process.env.LOCAL_DEMO_MODE === 'true',
    });
    const input = inputSchema.parse(await readJson(request));
    const projects = await service.list(actor);
    if (!projects.some((project) => project.id === input.projectId)) {
      return failure(
        new MemoryAccessError('이 프로젝트의 메모리를 검색할 권한이 없습니다.'),
        requestId,
      );
    }
    const data = await searchMem0({
      query: input.query,
      projectId: input.projectId,
      signal: request.signal,
    });
    const body: ApiSuccessEnvelope<typeof data> = { data, requestId };
    return Response.json(body, {
      status: 200,
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    });
  } catch (error) {
    return failure(error, requestId);
  }
}

class MemoryAccessError extends Error {
  readonly code = 'MEMORY_ACCESS_DENIED';
}

function failure(error: unknown, requestId: string): Response {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = '공유 메모리를 검색하지 못했습니다.';
  let details: unknown;
  if (error instanceof AuthenticationError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error instanceof MemoryAccessError) {
    status = 403;
    code = error.code;
    message = error.message;
  } else if (error instanceof MemoryConfigurationError) {
    status = 503;
    code = error.code;
    message = error.message;
  } else if (error instanceof MemoryProviderError) {
    status = 502;
    code = error.code;
    message = error.message;
  } else if (error instanceof ZodError) {
    status = 400;
    code = 'INVALID_INPUT';
    message = '프로젝트와 검색어를 확인해 주세요.';
    details = z.treeifyError(error);
  } else if (error instanceof RequestBoundaryError) {
    status = error.status;
    code = error.code;
    message = error.message;
  }
  const body: ApiErrorEnvelope = {
    error: { code, message, requestId, ...(details ? { details } : {}) },
  };
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
  });
}
