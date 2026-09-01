import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseUrl = 'http://localhost:3217';
const pidPath = resolve('.e2e-server.pid');
const vinextLockPath = resolve('.vinext/dev/lock.json');

function migrateLocalDatabase(): void {
  const wranglerCli = resolve('node_modules/wrangler/bin/wrangler.js');
  const result = spawnSync(
    process.execPath,
    [
      wranglerCli,
      'd1',
      'migrations',
      'apply',
      'DB',
      '--local',
      '--config',
      'wrangler.local.jsonc',
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WRANGLER_WRITE_LOGS: 'false',
        WRANGLER_LOG_PATH: '.wrangler/logs',
      },
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    throw new Error('E2E 로컬 D1 마이그레이션에 실패했습니다.');
  }
}

async function isReady(): Promise<boolean> {
  try {
    const response = await fetch(baseUrl, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return false;
    return (await response.text()).includes('QTO QA &amp; Analytics Studio');
  } catch {
    return false;
  }
}

async function waitUntilReady(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`E2E 개발 서버가 종료되었습니다. exit=${child.exitCode}`);
    }
    if (await isReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('E2E 개발 서버가 60초 안에 준비되지 않았습니다.');
}

function stopTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

export default async function globalSetup() {
  migrateLocalDatabase();
  if (await isReady()) {
    throw new Error(
      'E2E 전용 포트 3217이 이미 사용 중입니다. 기존 서버를 종료해 주세요.',
    );
  }

  const npmCommand =
    process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
  const npmArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm run dev -- --port 3217']
      : ['run', 'dev', '--', '--port', '3217'];
  const child = spawn(npmCommand, npmArgs, {
    cwd: process.cwd(),
    detached: process.platform !== 'win32',
    env: { ...process.env, E2E: '1', LOCAL_DEMO_MODE: 'true' },
    stdio: 'ignore',
    windowsHide: true,
  });

  try {
    await waitUntilReady(child);
  } catch (error) {
    stopTree(child);
    throw error;
  }
  const serverPid = existsSync(vinextLockPath)
    ? (JSON.parse(readFileSync(vinextLockPath, 'utf8')) as { pid?: number }).pid
    : child.pid;
  writeFileSync(pidPath, String(serverPid ?? child.pid), 'utf8');
}
