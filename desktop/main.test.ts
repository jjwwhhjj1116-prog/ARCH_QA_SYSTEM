// @vitest-environment node
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

type Envelope = { data?: unknown; error?: string };
type Handler = (event: unknown, input?: unknown) => Promise<Envelope>;
const mock = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  windows: [] as { webContents: object; url: string }[],
  workers: [] as (import('node:events').EventEmitter & {
    terminate: () => Promise<number>;
  })[],
  fetch: vi.fn(),
  clearStorageData: vi.fn(async () => {}),
  instructionAction: vi.fn(),
  workerData: [] as unknown[],
}));
vi.mock('electron', () => ({
  app: { whenReady: () => Promise.resolve(), on: vi.fn(), quit: vi.fn() },
  ipcMain: {
    handle: (name: string, fn: Handler) => mock.handlers.set(name, fn),
  },
  BrowserWindow: class {
    url = '';
    webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn(), send: vi.fn() };
    constructor() {
      mock.windows.push(this);
    }
    setMenu() {}
    isDestroyed() {
      return false;
    }
    loadFile(path: string) {
      this.url = pathToFileURL(path).href;
    }
  },
  session: {
    fromPartition: () => ({
      fetch: mock.fetch,
      clearStorageData: mock.clearStorageData,
      setPermissionRequestHandler: vi.fn(),
    }),
  },
  dialog: {
    showOpenDialog: async () => ({
      canceled: false,
      filePaths: ['C:/synthetic/source.csv'],
    }),
  },
}));
vi.mock('node:worker_threads', () => ({
  Worker: class extends EventEmitter {
    constructor(_path: unknown, options: { workerData: unknown }) {
      super();
      mock.workerData.push(options.workerData);
      mock.workers.push(this);
    }
    async terminate() {
      this.emit('exit', 1);
      return 1;
    }
  },
}));
vi.mock('node:fs/promises', () => ({
  lstat: async () => ({
    isFile: () => true,
    isSymbolicLink: () => false,
    size: 100,
  }),
}));
vi.mock('./save-report.mjs', () => ({ saveNewReport: vi.fn() }));
vi.mock('./instructions.mjs', () => ({
  instructionAction: mock.instructionAction,
}));

const response = (data: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => ({ data }),
});
const user = { email: 'synthetic@example.invalid', displayName: '합성 회원' };
let role = 'reviewer';
function invoke(name: string, input?: unknown) {
  const window = mock.windows[0]!;
  return mock.handlers.get(name)!(
    { sender: window.webContents, senderFrame: { url: window.url } },
    input,
  );
}
async function picked() {
  const result = await invoke('qc:choose');
  const files = result.data as { id: string }[];
  return { projectId: 'synthetic-project', ids: files.map((f) => f.id) };
}
async function workerStarted() {
  await vi.waitFor(() => expect(mock.workers).toHaveLength(1));
  return mock.workers[0]!;
}

beforeEach(async () => {
  vi.resetModules();
  mock.handlers.clear();
  mock.windows.length = 0;
  mock.workers.length = 0;
  mock.workerData.length = 0;
  mock.fetch.mockReset();
  mock.clearStorageData.mockClear();
  mock.instructionAction.mockReset();
  mock.instructionAction.mockResolvedValue({ profiles: [] });
  role = 'reviewer';
  mock.fetch.mockImplementation(async (url: string) =>
    response(
      url.endsWith('/api/projects')
        ? [{ id: 'synthetic-project', name: '합성 프로젝트', role }]
        : user,
    ),
  );
  await import('./main.mjs');
  await vi.waitFor(() => expect(mock.handlers.has('qc:export')).toBe(true));
});
afterEach(() => {
  for (const worker of mock.workers) worker.emit('exit', 0);
});

describe('desktop privileged IPC boundaries', () => {
  it('creates with the shared project contract and verifies the refreshed list', async () => {
    const project = {
      id: 'new-project',
      name: '새 현장',
      code: 'MANUAL-TEST',
      role: 'project_owner',
    };
    mock.fetch.mockImplementation(
      async (url: string, options: { method: string }) => {
        if (!url.endsWith('/api/projects')) return response(user);
        return response(options.method === 'POST' ? project : [project]);
      },
    );
    expect(await invoke('qc:createProject', { name: ' 새 현장 ' })).toEqual({
      data: project,
    });
    const posts = mock.fetch.mock.calls.filter(
      ([, options]) => options.method === 'POST',
    );
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]![1].body)).toEqual({
      name: '새 현장',
      clientName: '',
    });
  });
  it('rejects malformed creation without sending a mutation', async () => {
    expect(
      (await invoke('qc:createProject', { name: 'x', role: 'workspace_admin' }))
        .error,
    ).toContain('프로젝트명');
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it('blocks creation when the account changes before mutation', async () => {
    let reads = 0;
    mock.fetch.mockImplementation(async () =>
      response(
        ++reads === 1 ? user : { ...user, email: 'other@example.invalid' },
      ),
    );
    expect(
      (await invoke('qc:createProject', { name: '새 현장' })).error,
    ).toContain('계정');
    expect(
      mock.fetch.mock.calls.every(([, options]) => options.method === 'GET'),
    ).toBe(true);
  });
  it('does not retry an ambiguous creation response and releases the lock', async () => {
    mock.fetch.mockImplementation(
      async (_url: string, options: { method: string }) => {
        if (options.method === 'POST') throw new Error('network lost');
        return response(user);
      },
    );
    const failed = await invoke('qc:createProject', { name: '새 현장' });
    expect(failed.error).toContain('자동 재시도하지 않았습니다');
    expect(
      mock.fetch.mock.calls.filter(([, options]) => options.method === 'POST'),
    ).toHaveLength(1);
    expect((await invoke('qc:createProject', { name: 'x' })).error).toContain(
      '프로젝트명',
    );
  });
  it('blocks double submission while creation is pending', async () => {
    let resolvePost: (value: unknown) => void = () => {};
    const project = { id: 'new-project', name: '새 현장' };
    mock.fetch.mockImplementation(
      async (url: string, options: { method: string }) => {
        if (options.method === 'POST')
          return new Promise((resolve) => {
            resolvePost = resolve;
          });
        return response(url.endsWith('/api/projects') ? [project] : user);
      },
    );
    const first = invoke('qc:createProject', { name: '새 현장' });
    await vi.waitFor(() =>
      expect(
        mock.fetch.mock.calls.some(([, options]) => options.method === 'POST'),
      ).toBe(true),
    );
    expect(
      (await invoke('qc:createProject', { name: '새 현장' })).error,
    ).toContain('생성 중');
    resolvePost(response(project));
    expect(await first).toEqual({ data: project });
  });
  it('does not report successful creation if the refreshed list is unavailable', async () => {
    mock.fetch.mockImplementation(
      async (url: string, options: { method: string }) => {
        if (!url.endsWith('/api/projects')) return response(user);
        return response(
          options.method === 'POST' ? { id: 'created-project' } : [],
        );
      },
    );
    expect(
      (await invoke('qc:createProject', { name: '새 현장' })).error,
    ).toContain('중복 생성하지 말고');
    expect(
      mock.fetch.mock.calls.filter(([, options]) => options.method === 'POST'),
    ).toHaveLength(1);
  });
  const pid = '11111111-1111-4111-8111-111111111111';
  const cid = '22222222-2222-4222-8222-222222222222';
  const pkgid = '33333333-3333-4333-8333-333333333333';
  const sid = '44444444-4444-4444-8444-444444444444';
  const uid = '55555555-5555-4555-8555-555555555555';
  const cloudInput = {
    projectId: pid,
    caseId: cid,
    packageId: pkgid,
    sourceVersionId: sid,
  };
  function cloudServer() {
    const bytes = new TextEncoder().encode('품명,산식,물량\n벽,1/0,0');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const pkg = {
      id: pkgid,
      projectId: pid,
      reviewCaseId: cid,
      version: 1,
      status: 'receiving',
      files: [
        {
          uploadId: uid,
          sourceFileId: sid,
          sourceVersionId: sid,
          filename: 'cloud.csv',
          format: 'csv',
          sizeBytes: bytes.length,
          status: 'uploaded',
          uploadState: 'uploaded',
        },
      ],
    };
    mock.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/session')) return response(user);
      if (url.endsWith('/api/projects')) return response([{ id: pid, role }]);
      if (url.endsWith('/cases'))
        return response([
          { id: cid, name: 'FIN', discipline: 'FIN', status: 'draft' },
        ]);
      if (url.endsWith('/source-packages')) return response([pkg]);
      if (url.endsWith('/original'))
        return new Response(bytes, {
          status: 206,
          headers: {
            'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
            'x-original-sha256': hash,
          },
        });
      if (url.endsWith('/logout')) return response({});
      throw new Error('Unexpected request');
    });
    return { pkg, bytes };
  }
  it('imports Drive bytes without exposing them and passes their lineage to the worker', async () => {
    const { bytes } = cloudServer();
    const listed = await invoke('qc:cloudSources', { projectId: pid });
    expect(listed.error).toBeUndefined();
    const imported = await invoke('qc:importSource', cloudInput);
    const items = imported.data as { id: string }[];
    expect(JSON.stringify(imported)).not.toContain('bytes');
    const running = invoke('qc:review', {
      projectId: pid,
      ids: [items[0]!.id],
    });
    await workerStarted();
    expect(mock.workerData[0]).toMatchObject({
      context: { projectId: pid, caseId: cid },
      files: [{ bytes, provenance: { sourceVersionId: sid } }],
    });
    await invoke('qc:cancel');
    expect((await running).error).toBeTruthy();
  });
  it('does not reuse removed cloud originals or allow viewer imports', async () => {
    const { pkg } = cloudServer();
    const imported = await invoke('qc:importSource', cloudInput);
    pkg.files[0]!.status = 'deleted';
    expect(
      (
        await invoke('qc:review', {
          projectId: pid,
          ids: [(imported.data as { id: string }[])[0]!.id],
        })
      ).error,
    ).toContain('제외');
    expect(mock.workers).toHaveLength(0);
    role = 'viewer';
    expect((await invoke('qc:importSource', cloudInput)).error).toContain(
      '권한',
    );
  });
  it('cancels an in-flight cloud import without reviving handles', async () => {
    cloudServer();
    const base = mock.fetch.getMockImplementation()!;
    let release!: (value: unknown) => void;
    mock.fetch.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/original'))
        return new Promise((resolve) => {
          release = resolve;
        });
      return base(url, init);
    });
    const importing = invoke('qc:importSource', cloudInput);
    await vi.waitFor(() => expect(release).toBeDefined());
    expect((await invoke('qc:importSource', cloudInput)).error).toContain(
      '진행 중',
    );
    await invoke('qc:logout');
    release(await base('https://fixed.invalid/original'));
    expect((await importing).error).toContain('변경');
  });
  it('does not treat an unreadable successful POST response as a completed mutation', async () => {
    mock.fetch.mockImplementation(async (url: string) =>
      url.endsWith('/synthetic/review')
        ? {
            ok: true,
            json: async () => {
              throw new Error('malformed JSON');
            },
          }
        : response(user),
    );
    mock.instructionAction.mockImplementation(
      async (
        api: (path: string, method: string, body: object) => Promise<unknown>,
      ) => api('/api/projects/synthetic/review', 'POST', { action: 'profile' }),
    );
    expect(
      (await invoke('qc:instructions', { action: 'save' })).error,
    ).toContain('성공으로 표시하지');
  });
  it('serializes instruction mutations before authentication and releases the lock on failure', async () => {
    let rejectFirst!: (error: Error) => void;
    mock.instructionAction.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );
    const first = invoke('qc:instructions', { action: 'trial' });
    expect(
      (await invoke('qc:instructions', { action: 'approve' })).error,
    ).toContain('진행 중');
    await vi.waitFor(() => expect(rejectFirst).toBeDefined());
    rejectFirst(new Error('synthetic failure'));
    expect((await first).error).toContain('synthetic failure');
    expect(
      (await invoke('qc:instructions', { action: 'save' })).error,
    ).toBeUndefined();
    expect(mock.instructionAction).toHaveBeenCalledTimes(2);
  });
  it('reports an uncertain POST without retrying or exposing transport details', async () => {
    mock.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/synthetic/review'))
        throw new Error('secret transport details');
      return response(user);
    });
    mock.instructionAction.mockImplementation(
      async (
        api: (path: string, method: string, body: object) => Promise<unknown>,
      ) => api('/api/projects/synthetic/review', 'POST', { action: 'run' }),
    );
    const result = await invoke('qc:instructions', { action: 'trial' });
    expect(result.error).toContain('처리 여부를 확인할 수 없습니다');
    expect(result.error).not.toContain('secret');
    expect(
      mock.fetch.mock.calls.filter(([url]) =>
        url.endsWith('/synthetic/review'),
      ),
    ).toHaveLength(1);
  });
  it('returns bounded inspection data without creating an exportable report', async () => {
    const input = await picked();
    const running = invoke('qc:review', { ...input, mode: 'inspect' });
    const worker = await workerStarted();
    const preview = {
      files: [{ filename: 'source.csv', sheets: [] }],
      limitations: [],
    };
    worker.emit('message', { type: 'result', result: preview });
    expect((await running).data).toEqual(preview);
    expect((await invoke('qc:export')).error).toContain(
      '처리된 일반 검수 결과가 없습니다',
    );
  });
  it('rejects unknown modes and oversized override payloads before any worker starts', async () => {
    const input = await picked();
    for (const extra of [
      { mode: 'upload' },
      { overrides: {} },
      { overrides: ['x'.repeat(1048577)] },
    ]) {
      expect(
        (await invoke('qc:review', { ...input, ...extra })).error,
      ).toBeTruthy();
    }
    expect(mock.workers).toHaveLength(0);
  });
  it('discards instruction responses arriving after logout', async () => {
    let finish!: (value: unknown) => void;
    mock.instructionAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const loading = invoke('qc:instructions', { action: 'list' });
    await vi.waitFor(() =>
      expect(mock.instructionAction).toHaveBeenCalledOnce(),
    );
    await invoke('qc:logout');
    finish({ profiles: [{ name: 'late profile' }] });
    expect((await loading).error).toContain('계정이 변경');
  });
  it('rejects instruction work whose initial authentication crosses logout', async () => {
    let resolveActor!: (value: unknown) => void;
    let calls = 0;
    mock.fetch.mockImplementation(async (url: string) =>
      url.endsWith('/api/auth/session') && ++calls === 1
        ? new Promise((resolve) => {
            resolveActor = resolve;
          })
        : response(user),
    );
    const loading = invoke('qc:instructions', { action: 'list' });
    await vi.waitFor(() => expect(resolveActor).toBeDefined());
    await invoke('qc:logout');
    resolveActor(response(user));
    expect((await loading).error).toContain('계정이 변경');
    expect(mock.instructionAction).not.toHaveBeenCalled();
  });
  it('does not issue an instruction mutation when logout occurs during the pre-request actor check', async () => {
    let resolveActor!: (value: unknown) => void;
    let calls = 0;
    mock.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/session') && ++calls === 2)
        return new Promise((resolve) => {
          resolveActor = resolve;
        });
      return response(user);
    });
    mock.instructionAction.mockImplementation(
      async (
        api: (path: string, method: string, body: object) => Promise<unknown>,
      ) => api('/api/projects/synthetic/review', 'POST', { action: 'profile' }),
    );
    const saving = invoke('qc:instructions', { action: 'save' });
    await vi.waitFor(() => expect(resolveActor).toBeDefined());
    await invoke('qc:logout');
    resolveActor(response(user));
    expect((await saving).error).toContain('계정이 변경');
    expect(
      mock.fetch.mock.calls.some(([url]) => url.endsWith('/synthetic/review')),
    ).toBe(false);
  });
  it('rejects unauthenticated review before starting a worker', async () => {
    mock.fetch.mockResolvedValue(response(null, 401));
    expect(
      (
        await invoke('qc:review', {
          projectId: 'synthetic-project',
          ids: ['unknown'],
        })
      ).error,
    ).toContain('회원 로그인');
    expect(mock.workers).toHaveLength(0);
  });
  it('rejects a viewer even with a valid file handle', async () => {
    const input = await picked();
    role = 'viewer';
    expect((await invoke('qc:review', input)).error).toContain(
      '검수 실행 권한',
    );
    expect(mock.workers).toHaveLength(0);
  });
  it('rejects IPC from another window or a different document', async () => {
    const handler = mock.handlers.get('qc:session')!;
    await expect(
      handler({ sender: {}, senderFrame: { url: mock.windows[0]!.url } }),
    ).rejects.toThrow('허용되지 않은');
    await expect(
      handler({
        sender: mock.windows[0]!.webContents,
        senderFrame: { url: 'https://example.invalid' },
      }),
    ).rejects.toThrow('허용되지 않은');
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it('locks review before awaiting authentication and rejects simultaneous invocations', async () => {
    const input = await picked();
    const first = invoke('qc:review', input);
    expect((await invoke('qc:review', input)).error).toContain('이미 검수 중');
    await workerStarted();
    await invoke('qc:cancel');
    expect((await first).error).toBeTruthy();
    expect(mock.workers).toHaveLength(1);
  });
  for (const action of ['qc:cancel', 'qc:logout']) {
    it(`does not revive results arriving after ${action}`, async () => {
      const input = await picked();
      const running = invoke('qc:review', input);
      const worker = await workerStarted();
      // Result resolves the worker promise, but post-run authorization still awaits.
      worker.emit('message', {
        type: 'result',
        result: {
          run: {
            id: 'late-run',
            findings: [],
            rows: [],
            coverage: [],
            limitations: [],
            rowCount: 1,
          },
          files: [{ filename: 'source.csv' }],
          report: new Uint8Array([1]),
        },
      });
      await invoke(action);
      expect((await running).error).toBeTruthy();
      expect((await invoke('qc:export')).error).toContain(
        '처리된 일반 검수 결과가 없습니다',
      );
      if (action === 'qc:logout')
        expect(mock.clearStorageData).toHaveBeenCalledOnce();
    });
  }
});
