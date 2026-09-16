import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { lstat } from 'node:fs/promises';
import { saveNewReport } from './save-report.mjs';
import { randomUUID } from 'node:crypto';
import { rolesForAction } from '../lib/domain/permissions';
import { createProjectSchema } from '../lib/domain/contracts';
import { instructionAction } from './instructions.mjs';
import { watchLogin } from './login-watch.mjs';
import {
  loadRegisteredSource,
  listRegisteredSources,
} from './registered-source';
const reviewRoles = rolesForAction('review:run');
const dir = dirname(fileURLToPath(import.meta.url));
const origin = 'https://concost-qc-studio.jjwwhhjj1116.workers.dev';
let window, authWindow, authSession, activeWorker, result;
let operationEpoch = 0,
  reviewBusy = false,
  instructionMutationBusy = false,
  projectCreationBusy = false;
let downloadController;
let stopLoginWatch;
const files = new Map();
const localURL = pathToFileURL(join(dir, 'ui/index.html')).href;
async function api(path, method = 'GET', data) {
  let response;
  try {
    response = await authSession.fetch(origin + path, {
      method,
      credentials: 'include',
      redirect: 'error',
      headers: {
        Origin: origin,
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error(
      method === 'GET'
        ? '서버 연결이 중단되었습니다. 연결 상태를 확인해 주세요.'
        : '서버 응답을 받지 못해 처리 여부를 확인할 수 없습니다. 자동 재시도하지 않았습니다. 서버 이력을 확인한 뒤 다시 진행해 주세요.',
    );
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? '회원 로그인이 필요합니다.'
        : (body.error?.message ?? '서버 연결을 확인해 주세요.'),
    );
  if (!body || typeof body !== 'object' || !Object.hasOwn(body, 'data'))
    throw new Error(
      method === 'GET'
        ? '서버 응답 형식을 확인할 수 없습니다.'
        : '서버 결과 형식을 확인할 수 없어 성공으로 표시하지 않았습니다. 서버 이력을 확인해 주세요.',
    );
  return body.data;
}
async function actor() {
  return await api('/api/auth/session');
}
function progress(message) {
  if (!window.isDestroyed())
    window.webContents.send('qc:progress', { message });
}
function handle(name, fn) {
  ipcMain.handle(name, async (event, input) => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame?.url !== localURL
    )
      throw new Error('허용되지 않은 요청입니다.');
    try {
      return { data: await fn(input) };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : '작업을 완료하지 못했습니다.',
      };
    }
  });
}
void app.whenReady().then(() => {
  // Memory-only session: the roster, passwords and cookies are not packaged or persisted.
  authSession = session.fromPartition('qc-member-session');
  authSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1000,
    minHeight: 700,
    title: 'CONCOST QC 스튜디오 · 설치형 시험판',
    webPreferences: {
      preload: join(dir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  handle('qc:session', actor);
  handle('qc:instructions', async (input) => {
    const mutation = ['save', 'trial', 'approve'].includes(input?.action);
    if (mutation && instructionMutationBusy)
      throw new Error(
        '지침 작업이 진행 중입니다. 처리 결과를 먼저 확인해 주세요.',
      );
    if (mutation) instructionMutationBusy = true;
    try {
      const epoch = operationEpoch,
        user = await actor();
      if (epoch !== operationEpoch)
        throw new Error('계정이 변경되었습니다. 지침을 다시 조회해 주세요.');
      const scopedApi = async (...args) => {
        const current = await actor();
        if (epoch !== operationEpoch || current.email !== user.email)
          throw new Error('계정이 변경되었습니다. 지침을 다시 조회해 주세요.');
        return api(...args);
      };
      const response = await instructionAction(scopedApi, input);
      const current = await actor();
      if (epoch !== operationEpoch || current.email !== user.email)
        throw new Error('계정이 변경되었습니다. 지침을 다시 조회해 주세요.');
      return response;
    } finally {
      if (mutation) instructionMutationBusy = false;
    }
  });
  handle('qc:login', async () => {
    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.focus();
      return { opened: true };
    }
    authWindow = new BrowserWindow({
      width: 1060,
      height: 800,
      parent: window,
      webPreferences: {
        session: authSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    authWindow.setMenu(null);
    authWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    authWindow.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== origin) event.preventDefault();
    });
    const loginWindow = authWindow,
      epoch = operationEpoch;
    stopLoginWatch?.();
    loginWindow.on('closed', () => stopLoginWatch?.());
    await loginWindow.loadURL(origin);
    stopLoginWatch = watchLogin(
      actor,
      () =>
        epoch === operationEpoch &&
        authWindow === loginWindow &&
        !loginWindow.isDestroyed() &&
        !window.isDestroyed(),
      () => {
        loginWindow.close();
        window.show();
        window.focus();
        window.webContents.send('qc:authenticated');
      },
    );
    return { opened: true };
  });
  handle('qc:logout', async () => {
    stopLoginWatch?.();
    operationEpoch++;
    downloadController?.abort();
    if (activeWorker) await activeWorker.terminate();
    activeWorker = null;
    result = null;
    files.clear();
    try {
      await api('/api/auth/logout', 'POST', {});
    } finally {
      await authSession.clearStorageData();
      if (authWindow && !authWindow.isDestroyed()) authWindow.close();
    }
    return { signedOut: true };
  });
  handle('qc:projects', async () => {
    await actor();
    const list = await api('/api/projects');
    if (authWindow && !authWindow.isDestroyed()) authWindow.close();
    return list;
  });
  handle('qc:createProject', async (input) => {
    if (projectCreationBusy)
      throw new Error(
        '프로젝트 생성 중입니다. 처리 결과를 먼저 확인해 주세요.',
      );
    const parsed = createProjectSchema.strict().safeParse(input);
    if (!parsed.success)
      throw new Error(
        '프로젝트명은 2~120자, 코드는 생략하거나 2~40자, 발주처는 120자 이하로 입력해 주세요.',
      );
    projectCreationBusy = true;
    const epoch = operationEpoch;
    try {
      const user = await actor();
      const assertAccount = async () => {
        const current = await actor();
        if (epoch !== operationEpoch || current.email !== user.email)
          throw new Error(
            '계정 또는 작업이 변경되었습니다. 현재 계정의 프로젝트 목록을 다시 확인해 주세요.',
          );
      };
      await assertAccount();
      // A lost POST response is ambiguous: never retry a project creation automatically.
      const created = await api('/api/projects', 'POST', parsed.data);
      await assertAccount();
      try {
        if (typeof created?.id !== 'string' || !created.id)
          throw new Error('created project id missing');
        const projects = await api('/api/projects');
        await assertAccount();
        const verified = projects.find((project) => project.id === created?.id);
        if (!verified) throw new Error('created project missing');
        return verified;
      } catch {
        throw new Error(
          '생성 응답은 받았으나 현재 프로젝트 목록에서 확인하지 못했습니다. 중복 생성하지 말고 목록을 새로고침해 주세요.',
        );
      }
    } finally {
      projectCreationBusy = false;
    }
  });
  handle('qc:choose', async () => {
    const user = await actor(),
      epoch = operationEpoch;
    if (reviewBusy) throw new Error('검수 종료 후 파일을 선택해 주세요.');
    const chosen = await dialog.showOpenDialog(window, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '산출서·집계표', extensions: ['xlsx', 'csv'] }],
    });
    if (chosen.canceled) return [];
    if (chosen.filePaths.length > 16)
      throw new Error('시험판은 한 번에 16개까지 선택할 수 있습니다.');
    const pending = [];
    let total = 0;
    for (const path of chosen.filePaths) {
      const stat = await lstat(path);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size < 1 ||
        stat.size > 20 * 1048576
      )
        throw new Error('일반 파일만 지원하며 파일당 한도는 20MiB입니다.');
      total += stat.size;
      pending.push({
        id: randomUUID(),
        path,
        filename: basename(path),
        size: stat.size,
      });
    }
    if (total > 80 * 1048576)
      throw new Error('시험판의 선택 합계는 80MiB 이하입니다.');
    if (
      (await actor()).email !== user.email ||
      epoch !== operationEpoch ||
      reviewBusy
    )
      throw new Error('작업 상태가 변경되었습니다. 파일을 다시 선택해 주세요.');
    files.clear();
    result = null;
    for (const item of pending) files.set(item.id, item);
    return pending.map(({ id, filename, size }) => ({ id, filename, size }));
  });
  async function sourceScope(projectId, email, epoch) {
    const user = await actor();
    const projects = await api('/api/projects');
    if (epoch !== operationEpoch || user.email !== email)
      throw new Error(
        '계정 또는 작업이 변경되었습니다. 자료를 다시 선택하세요.',
      );
    if (
      !projects.some((p) => p.id === projectId && reviewRoles.includes(p.role))
    )
      throw new Error('프로젝트 검수 실행 권한이 없습니다.');
  }
  async function registeredAvailable(projectId, items) {
    for (const item of items) {
      const current = await listRegisteredSources(api, {
        projectId,
        caseId: item.provenance.caseId,
      });
      if (
        !current.files.some(
          (file) =>
            file.sourceVersionId === item.provenance.sourceVersionId &&
            file.packageId === item.provenance.packageId &&
            file.filename === item.filename &&
            file.sizeBytes === item.size,
        )
      )
        throw new Error('등록 원본이 제외·교체되었습니다. 다시 가져오세요.');
    }
  }
  handle('qc:cloudSources', async (input) => {
    const epoch = operationEpoch,
      user = await actor();
    await sourceScope(input?.projectId, user.email, epoch);
    const data = await listRegisteredSources(api, input);
    await sourceScope(input.projectId, user.email, epoch);
    return data;
  });
  handle('qc:importSource', async (input) => {
    if (reviewBusy) throw new Error('진행 중인 작업을 먼저 종료하세요.');
    reviewBusy = true;
    const epoch = operationEpoch,
      controller = new AbortController();
    downloadController = controller;
    try {
      const user = await actor();
      const assertCurrent = () =>
        sourceScope(input?.projectId, user.email, epoch);
      await assertCurrent();
      // Validate the case again in main: renderer selections are not authority.
      await listRegisteredSources(api, {
        projectId: input?.projectId,
        caseId: input?.caseId,
      });
      const source = await loadRegisteredSource(
        api,
        (path, init) => {
          if (
            typeof path !== 'string' ||
            !/^\/api\/uploads\/[a-f0-9-]+\/original$/iu.test(path)
          )
            throw new Error('허용되지 않은 다운로드 주소입니다.');
          return authSession.fetch(origin + path, {
            ...init,
            credentials: 'include',
            redirect: 'error',
            headers: {
              ...Object.fromEntries(new Headers(init.headers)),
              Origin: origin,
            },
            signal: AbortSignal.any([
              controller.signal,
              init.signal ?? AbortSignal.timeout(60000),
            ]),
          });
        },
        input,
        assertCurrent,
        (bytes) =>
          progress(
            `등록 원본 가져오는 중 · ${(bytes / 1048576).toFixed(2)}MiB 확인`,
          ),
      );
      await assertCurrent();
      const item = {
        ...source,
        id: randomUUID(),
        size: source.bytes.byteLength,
        ownerEmail: user.email,
      };
      files.clear();
      files.set(item.id, item);
      result = null;
      return [
        {
          id: item.id,
          filename: item.filename,
          size: item.size,
          registered: true,
        },
      ];
    } finally {
      if (downloadController === controller) downloadController = undefined;
      reviewBusy = false;
    }
  });
  handle('qc:review', async (input) => {
    if (reviewBusy) throw new Error('이미 검수 중입니다.');
    reviewBusy = true;
    const epoch = operationEpoch;
    try {
      const user = await actor();
      if (activeWorker) throw new Error('이미 검수 중입니다.');
      if (
        !input ||
        (input.mode !== undefined &&
          !['inspect', 'review'].includes(input.mode)) ||
        (input.overrides !== undefined &&
          (!Array.isArray(input.overrides) ||
            Buffer.byteLength(JSON.stringify(input.overrides), 'utf8') >
              1048576)) ||
        typeof input.projectId !== 'string' ||
        !Array.isArray(input.ids) ||
        !input.ids.length ||
        input.ids.length > 16 ||
        new Set(input.ids).size !== input.ids.length
      )
        throw new Error('프로젝트와 파일을 선택해 주세요.');
      const projects = await api('/api/projects');
      if (
        !projects.some(
          (p) => p.id === input.projectId && reviewRoles.includes(p.role),
        )
      )
        throw new Error('프로젝트 검수 실행 권한이 없습니다.');
      const selected = input.ids.map((id) => files.get(id));
      if (selected.some((f) => !f))
        throw new Error('파일을 다시 선택해 주세요.');
      const registered = selected.filter((item) => item.provenance);
      if (
        registered.some(
          (item) =>
            item.ownerEmail !== user.email ||
            item.provenance.projectId !== input.projectId,
        ) ||
        new Set(registered.map((item) => item.provenance.caseId)).size > 1
      )
        throw new Error(
          '등록 원본의 계정·프로젝트·자료 기록을 다시 확인하세요.',
        );
      await registeredAvailable(input.projectId, registered);
      result = null;
      if (epoch !== operationEpoch) throw new Error('검수가 취소되었습니다.');
      const answer = await new Promise((resolve, reject) => {
        const worker = new Worker(join(dir, 'worker.js'), {
          workerData: {
            files: selected,
            context: {
              projectId: input.projectId,
              actorId: user.email,
              caseId: registered[0]?.provenance.caseId,
            },
            mode: input.mode === 'inspect' ? 'inspect' : 'review',
            overrides: input.overrides,
          },
          resourceLimits: { maxOldGenerationSizeMb: 512 },
        });
        activeWorker = worker;
        const timer = setTimeout(() => {
          void worker.terminate();
          reject(
            new Error('검수 시간 한도 3분을 넘었습니다. 파일을 나누어 주세요.'),
          );
        }, 180000);
        worker.on('message', (message) => {
          if (message.type === 'progress') progress(message.message);
          else if (message.type === 'result') resolve(message.result);
          else if (message.type === 'error') reject(new Error(message.message));
        });
        worker.on('error', () =>
          reject(
            new Error(
              '작업 프로세스가 중단되었습니다. 원본은 변경하지 않았습니다.',
            ),
          ),
        );
        worker.on('exit', () => {
          clearTimeout(timer);
          if (activeWorker === worker) activeWorker = null;
          reject(new Error('검수가 취소되거나 결과 없이 중단되었습니다.'));
        });
      });
      const current = await actor();
      if (current.email !== user.email)
        throw new Error(
          '로그인 계정이 변경되었습니다. 결과를 저장하지 않았습니다.',
        );
      const latest = await api('/api/projects');
      if (
        !latest.some(
          (p) => p.id === input.projectId && reviewRoles.includes(p.role),
        )
      )
        throw new Error('프로젝트 검수 권한이 변경되었습니다.');
      if (epoch !== operationEpoch) throw new Error('검수가 취소되었습니다.');
      await registeredAvailable(input.projectId, registered);
      await sourceScope(input.projectId, user.email, epoch);
      if (input.mode === 'inspect') return answer;
      result = {
        ...answer,
        ownerEmail: user.email,
        projectId: input.projectId,
        registered: registered.map(({ provenance, filename, size }) => ({
          provenance,
          filename,
          size,
        })),
      };
      const visibleFindings = answer.run.findings.slice(0, 500);
      const visibleIds = new Set(
        visibleFindings.flatMap((f) => [f.rowId, ...f.peerIds]),
      );
      return {
        runId: answer.run.id,
        findings: visibleFindings,
        coverage: answer.run.coverage,
        rowCount: answer.run.rowCount,
        sourceRefs: Object.fromEntries(
          answer.run.rows
            .filter((r) => visibleIds.has(r.id))
            .map((r) => [r.id, r.ref]),
        ),
        findingCount: answer.run.findings.length,
        limitations: answer.run.limitations,
        files: answer.files,
        localOnly: true,
      };
    } finally {
      reviewBusy = false;
    }
  });
  handle('qc:cancel', async () => {
    operationEpoch++;
    downloadController?.abort();
    result = null;
    if (activeWorker) await activeWorker.terminate();
    return { cancelled: true };
  });
  handle('qc:export', async () => {
    const snapshot = result;
    if (!snapshot || !snapshot.files.length)
      throw new Error('처리된 일반 검수 결과가 없습니다.');
    async function authorize() {
      const user = await actor();
      const projects = await api('/api/projects');
      await registeredAvailable(snapshot.projectId, snapshot.registered ?? []);
      if (
        user.email !== snapshot.ownerEmail ||
        !projects.some((p) => p.id === snapshot.projectId) ||
        result !== snapshot
      )
        throw new Error('계정 또는 프로젝트 권한이 변경되었습니다.');
    }
    await authorize();
    const chosen = await dialog.showSaveDialog(window, {
      defaultPath: 'QC-일반검수-분석표.xlsx',
      filters: [{ name: 'Excel 분석표', extensions: ['xlsx'] }],
    });
    if (chosen.canceled || !chosen.filePath) return { saved: false };
    await authorize();
    await saveNewReport(chosen.filePath, snapshot.report);
    return { saved: true };
  });
  void window.loadFile(join(dir, 'ui/index.html'));
});
app.on('window-all-closed', () => {
  stopLoginWatch?.();
  downloadController?.abort();
  if (activeWorker) void activeWorker.terminate();
  app.quit();
});
