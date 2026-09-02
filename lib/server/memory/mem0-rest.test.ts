import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mem0ConfigurationStatus,
  MemoryConfigurationError,
  MemoryProviderError,
  searchMem0,
} from './mem0-rest';

const READY_ENV = {
  NODE_ENV: 'test' as const,
  MEMORY_MODE: 'platform',
  MEM0_API_KEY: 'server-only-test-key',
  MEM0_SHARED_AGENT_ID: 'concost-shared-test',
};

describe('Mem0 REST boundary', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is disabled by default and never exposes the secret', () => {
    const status = mem0ConfigurationStatus({ NODE_ENV: 'test' });
    expect(status).toEqual({
      mode: 'disabled',
      status: 'disabled',
      sourceApp: 'arch-qa-system',
      sharedAgentId: 'concost-qc-shared-v1',
      writeEnabled: false,
    });
    expect(JSON.stringify(status)).not.toContain('apiKey');
  });

  it('requires both platform mode and a server-only key', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      searchMem0({
        query: '프로젝트 규칙',
        projectId: 'project-1',
        environment: { NODE_ENV: 'test', MEMORY_MODE: 'platform' },
        fetcher,
      }),
    ).rejects.toBeInstanceOf(MemoryConfigurationError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses a fixed endpoint and forces shared-agent and project filters', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        results: [
          {
            id: 'memory-1',
            memory: '원본 파일은 수정하지 않는다.',
            score: 0.92,
            metadata: {
              tenant_id: 'concost',
              project_id: 'project-1',
              source_app: 'arch-qa-system',
            },
          },
        ],
      }),
    );
    const results = await searchMem0({
      query: `원본 규칙${'x'.repeat(600)}`,
      projectId: 'project-1',
      environment: READY_ENV,
      fetcher,
    });

    expect(results).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.mem0.ai/v3/memories/search/');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Token server-only-test-key',
        'content-type': 'application/json',
      },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(typeof init?.body).toBe('string');
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(String(body.query)).toHaveLength(500);
    expect(body).toMatchObject({
      filters: {
        AND: [
          { agent_id: 'concost-shared-test' },
          { 'metadata.tenant_id': 'concost' },
          { 'metadata.project_id': 'project-1' },
          { 'metadata.source_app': 'arch-qa-system' },
        ],
      },
      top_k: 5,
      rerank: false,
      show_expired: false,
    });
    expect(body).not.toHaveProperty('metadata');
  });

  it('rejects memories that do not prove the requested project scope', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        results: [
          {
            id: 'memory-p2',
            memory: '다른 프로젝트 규칙',
            metadata: {
              tenant_id: 'concost',
              project_id: 'project-2',
              source_app: 'arch-qa-system',
            },
          },
        ],
      }),
    );

    await expect(
      searchMem0({
        query: '프로젝트 규칙',
        projectId: 'project-1',
        environment: READY_ENV,
        fetcher,
      }),
    ).rejects.toBeInstanceOf(MemoryProviderError);
  });

  it('rejects memories whose scope metadata is missing', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        results: [
          {
            id: 'memory-without-scope',
            memory: '범위 없는 규칙',
            metadata: {},
          },
        ],
      }),
    );

    await expect(
      searchMem0({
        query: '프로젝트 규칙',
        projectId: 'project-1',
        environment: READY_ENV,
        fetcher,
      }),
    ).rejects.toBeInstanceOf(MemoryProviderError);
  });

  it('maps invalid or unavailable provider responses to a safe error', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('provider-secret-detail', { status: 500 }),
      );
    const result = searchMem0({
      query: '프로젝트 규칙',
      projectId: 'project-1',
      environment: READY_ENV,
      fetcher,
    });
    await expect(result).rejects.toBeInstanceOf(MemoryProviderError);
    await expect(result).rejects.not.toThrow('provider-secret-detail');
  });
});
