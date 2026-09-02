import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const ALLOWED_EMAIL = 'authorized@example.com';

function request(email = ALLOWED_EMAIL): Request {
  return new Request('http://localhost/api/settings/memory', {
    headers: {
      'oai-authenticated-user-id': 'user-1',
      'oai-authenticated-user-email': email,
    },
  });
}

describe('shared memory settings API', () => {
  beforeEach(() => {
    vi.stubEnv('LOCAL_DEMO_MODE', 'false');
    vi.stubEnv('APP_ALLOWED_EMAILS', ALLOWED_EMAIL);
    vi.stubEnv('MEMORY_MODE', 'disabled');
    vi.stubEnv('MEM0_API_KEY', '');
    vi.stubEnv('MEM0_SHARED_AGENT_ID', 'concost-qc-shared-v1');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('requires the platform identity and application allowlist', async () => {
    expect(
      (await GET(new Request('http://localhost/api/settings/memory'))).status,
    ).toBe(401);
    expect((await GET(request('other@example.com'))).status).toBe(403);
  });

  it('reports disabled without exposing key material', async () => {
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        mode: 'disabled',
        status: 'disabled',
        sharedAgentId: 'concost-qc-shared-v1',
        writeEnabled: false,
      },
    });
    expect(JSON.stringify(body)).not.toContain('MEM0_API_KEY');
  });

  it('reports ready only when platform mode and the key are both present', async () => {
    vi.stubEnv('MEMORY_MODE', 'platform');
    vi.stubEnv('MEM0_API_KEY', 'never-return-this-key');
    const body = await (await GET(request())).json();
    expect(body).toMatchObject({
      data: { mode: 'platform', status: 'ready', writeEnabled: false },
    });
    expect(JSON.stringify(body)).not.toContain('never-return-this-key');
  });
});
