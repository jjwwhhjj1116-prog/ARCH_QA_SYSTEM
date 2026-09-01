import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const pidPath = resolve('.e2e-server.pid');

export default function globalTeardown(): void {
  if (existsSync(pidPath)) {
    const pid = Number.parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
    try {
      if (Number.isFinite(pid) && pid > 0) {
        if (process.platform === 'win32') {
          const killed = spawnSync(
            'taskkill',
            ['/PID', String(pid), '/T', '/F'],
            {
              stdio: 'ignore',
              windowsHide: true,
            },
          );
          if (killed.status !== 0 && isProcessAlive(pid)) {
            process.kill(pid, 'SIGTERM');
          }
        } else {
          process.kill(-pid, 'SIGTERM');
        }
        waitForExit(pid);
      }
    } finally {
      unlinkSync(pidPath);
    }
  }

  const wranglerCli = resolve('node_modules/wrangler/bin/wrangler.js');
  const cleanup = spawnSync(
    process.execPath,
    [
      wranglerCli,
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      'wrangler.local.jsonc',
      '--file',
      'tests/e2e/cleanup.sql',
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
  if (cleanup.status !== 0) {
    throw new Error('E2E 프로젝트 정리에 실패했습니다.');
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function waitForExit(pid: number): void {
  const deadline = Date.now() + 5_000;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  while (isProcessAlive(pid) && Date.now() < deadline) {
    Atomics.wait(sleeper, 0, 0, 100);
  }
  if (isProcessAlive(pid)) {
    throw new Error(`E2E 개발 서버 PID ${pid}를 종료하지 못했습니다.`);
  }
}
