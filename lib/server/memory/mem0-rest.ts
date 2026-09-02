import { z } from 'zod';

const memoryResultSchema = z.object({
  id: z.string().min(1).max(200),
  memory: z.string().min(1).max(2_000),
  score: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

const memoryResponseSchema = z.object({
  results: z.array(memoryResultSchema).max(50),
});

export type Mem0ConfigurationStatus = {
  mode: 'disabled' | 'platform';
  status: 'ready' | 'not_configured' | 'disabled';
  sourceApp: string;
  sharedAgentId: string;
  writeEnabled: false;
};

export type Mem0SearchResult = z.infer<typeof memoryResultSchema>;

export class MemoryConfigurationError extends Error {
  readonly code = 'MEMORY_NOT_CONFIGURED';
}

export class MemoryProviderError extends Error {
  readonly code = 'MEMORY_PROVIDER_UNAVAILABLE';
}

export function mem0ConfigurationStatus(
  environment: NodeJS.ProcessEnv = process.env,
): Mem0ConfigurationStatus {
  const mode = environment.MEMORY_MODE === 'platform' ? 'platform' : 'disabled';
  const configured = Boolean(environment.MEM0_API_KEY?.trim());
  return {
    mode,
    status:
      mode === 'disabled'
        ? 'disabled'
        : configured
          ? 'ready'
          : 'not_configured',
    sourceApp: 'arch-qa-system',
    sharedAgentId:
      environment.MEM0_SHARED_AGENT_ID?.trim() || 'concost-qc-shared-v1',
    writeEnabled: false,
  };
}

export async function searchMem0(input: {
  query: string;
  projectId: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  environment?: NodeJS.ProcessEnv;
}): Promise<Mem0SearchResult[]> {
  const environment = input.environment ?? process.env;
  const status = mem0ConfigurationStatus(environment);
  const apiKey = environment.MEM0_API_KEY?.trim();
  if (status.status !== 'ready' || !apiKey) {
    throw new MemoryConfigurationError(
      '공유 메모리가 아직 연결되지 않았습니다. Mem0 서버 비밀키를 등록해 주세요.',
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  const stopForwarding = () => controller.abort();
  input.signal?.addEventListener('abort', stopForwarding, { once: true });
  try {
    const response = await (input.fetcher ?? fetch)(
      'https://api.mem0.ai/v3/memories/search/',
      {
        method: 'POST',
        headers: {
          authorization: `Token ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: input.query.slice(0, 500),
          filters: {
            AND: [
              { agent_id: status.sharedAgentId },
              { 'metadata.tenant_id': 'concost' },
              { 'metadata.project_id': input.projectId },
              { 'metadata.source_app': status.sourceApp },
            ],
          },
          fields: ['id', 'memory', 'score', 'metadata'],
          top_k: 5,
          rerank: false,
          show_expired: false,
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new MemoryProviderError(
        '공유 메모리 서버가 요청을 처리하지 못했습니다.',
      );
    }
    const results = memoryResponseSchema.parse(await response.json()).results;
    if (
      results.some(
        (result) =>
          result.metadata.tenant_id !== 'concost' ||
          result.metadata.project_id !== input.projectId ||
          result.metadata.source_app !== status.sourceApp,
      )
    ) {
      throw new MemoryProviderError(
        '공유 메모리의 프로젝트 범위를 확인하지 못했습니다.',
      );
    }
    return results;
  } catch (error) {
    if (
      error instanceof MemoryConfigurationError ||
      error instanceof MemoryProviderError
    ) {
      throw error;
    }
    throw new MemoryProviderError('공유 메모리 서버에 연결하지 못했습니다.');
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener('abort', stopForwarding);
  }
}
