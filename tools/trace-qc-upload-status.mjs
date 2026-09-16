// Read-only production diagnostics. Never emit headers, cookies, bodies or raw logs.
import { spawn } from 'node:child_process';
const child = spawn(
  process.execPath,
  [
    'node_modules/wrangler/wrangler-dist/cli.js',
    'tail',
    'concost-qc-studio',
    '--format',
    'json',
  ],
  {
    env: { ...process.env, WRANGLER_WRITE_LOGS: 'false' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  },
);
let buffer = '',
  depth = 0,
  quoted = false,
  escaped = false;
child.stdout.on('data', (chunk) => {
  for (const char of chunk.toString()) {
    if (!depth && char !== '{') continue;
    buffer += char;
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        const event = JSON.parse(buffer);
        const path = new URL(event.event?.request?.url ?? 'https://invalid')
          .pathname;
        if (path.startsWith('/api/uploads/'))
          console.log(
            JSON.stringify({
              outcome: event.outcome,
              status: event.event?.response?.status,
              cpuTime: event.cpuTime,
              wallTime: event.wallTime,
              exceptions: event.exceptions?.map((e) => e.name),
            }),
          );
      } catch {
        console.log('unreadable diagnostic event');
      }
      buffer = '';
    }
  }
});
process.on('SIGINT', () => {
  child.kill();
  process.exit();
});
