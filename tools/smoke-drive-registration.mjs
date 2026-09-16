// Approved QC-only login test. Credentials and cookies remain in memory.
// Synthetic bytes only; no Gemini calls or business-file changes.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
const [input, python] = process.argv.slice(2);
if (!input || !python)
  throw new Error('Credential workbook and bundled Python required');
const extracted = spawnSync(
  python,
  [
    '-c',
    `import json,sys,openpyxl\nb=openpyxl.load_workbook(sys.argv[1],read_only=True,data_only=True)\na=[]\nfor r in b.worksheets[0].iter_rows(min_row=10,values_only=True):\n e=r[14] if len(r)>15 else None\n if not isinstance(e,str) or '@' not in e: continue\n p=r[15]\n if isinstance(p,float) and p.is_integer(): p=int(p)\n a.append({'email':e.strip().lower(),'password':str(p)})\nprint(json.dumps(a))\nb.close()`,
    input,
  ],
  { encoding: 'utf8', windowsHide: true, maxBuffer: 1048576 },
);
if (extracted.status !== 0)
  throw new Error('Roster read failed; output suppressed');
const entries = JSON.parse(extracted.stdout);
extracted.stdout = '';
const admins = new Set(['yjw@con-cost.com', 'yjpark@con-cost.com']);
const accounts = [
  entries.find((e) => e.email === 'yjw@con-cost.com'),
  entries.find((e) => !admins.has(e.email)),
];
if (accounts.some((e) => !e)) throw new Error('Test accounts missing');
const origin = 'https://concost-qc-studio.jjwwhhjj1116.workers.dev';
const verify = (condition, label) => {
  if (!condition) throw new Error(label);
};
let phase = 'start';
try {
  for (const [index, account] of accounts.entries()) {
    let cookie = '';
    async function call(path, method = 'GET', body, extra = {}) {
      phase = method + ' ' + path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, ':id');
      const response = await fetch(origin + path, {
        method,
        headers: {
          origin,
          cookie,
          ...(body && !Buffer.isBuffer(body)
            ? { 'content-type': 'application/json' }
            : {}),
          ...extra,
        },
        ...(method === 'GET' || body === undefined
          ? {}
          : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
        signal: AbortSignal.timeout(60000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          'HTTP ' +
            response.status +
            ' ' +
            String(result.error?.code ?? 'unknown'),
        );
      return result.data;
    }
    try {
      phase = 'login';
      const response = await fetch(origin + '/api/auth/login', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify(account),
        signal: AbortSignal.timeout(60000),
      });
      verify(response.status === 200, 'Login HTTP ' + response.status);
      cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
      await response.arrayBuffer();
      verify(cookie, 'Session missing');
      const project = await call('/api/projects', 'POST', {
        name: `등록 회귀 QA ${new Date().toISOString()} ${index ? '직원' : '관리자'}`,
        clientName: '합성 파일 전송 테스트 전용',
      });
      const reviewCase = await call(
        `/api/projects/${project.id}/cases`,
        'POST',
        { name: '자료 저장 검증', discipline: 'FIN' },
      );
      const base = `/api/projects/${project.id}/cases/${reviewCase.id}`;
      const bytes = index
        ? Buffer.from('품명,규격,단위,물량\nQA,TEST,m2,1\n')
        : Buffer.alloc(24 * 1048576 + 7, 65);
      if (!index) bytes.write('AC1032', 0, 'ascii');
      const filename = index ? 'QA-합성.csv' : 'QA-전송전용-24MiB.dwg';
      const metadata = {
        filename,
        contentType: index ? 'text/csv' : 'application/octet-stream',
        sizeBytes: bytes.length,
      };
      const intent = index
        ? (
            await call(
              base + '/source-packages',
              'POST',
              { displayName: '합성 CSV 등록', files: [metadata] },
              { 'idempotency-key': randomUUID() },
            )
          ).files[0]
        : await call(base + '/attachments', 'POST', metadata, {
            'idempotency-key': randomUUID(),
          });
      if (index)
        verify(intent.transferMode === 'resumable', 'Transfer mode missing');
      const endpoint = `/api/uploads/${intent.uploadId}/transfer`;
      const hash = createHash('sha256').update(bytes).digest('hex');
      const headers = { 'upload-sha256': hash };
      let state = await call(endpoint, 'POST', undefined, headers),
        count = 0;
      while (state.status !== 'uploaded') {
        const old = state.offset;
        state = await call(
          endpoint,
          'PUT',
          bytes.subarray(old, Math.min(old + 1048576, bytes.length)),
          {
            ...headers,
            'upload-offset': String(old),
            'content-type': 'application/octet-stream',
          },
        );
        verify(state.offset > old, 'No acknowledged progress');
        count++;
        if (count === 2) {
          const resumed = await call(endpoint, 'POST', undefined, headers);
          verify(resumed.offset === state.offset, 'Resume offset mismatch');
          state = resumed;
          console.log(
            JSON.stringify({
              role: index ? 'employee' : 'admin',
              resumeVerified: true,
              offset: state.offset,
            }),
          );
        }
      }
      verify(
        state.offset === bytes.length && state.sha256 === hash,
        'Final integrity mismatch',
      );
      phase = 'download';
      const downloadedHash = createHash('sha256');
      for (let start = 0; start < bytes.length; start += 1048576) {
        const end = Math.min(start + 1048576, bytes.length) - 1;
        const downloaded = await fetch(
          origin + `/api/uploads/${intent.uploadId}/original`,
          {
            headers: { cookie, range: `bytes=${start}-${end}` },
            signal: AbortSignal.timeout(60000),
          },
        );
        verify(downloaded.status === 206, 'Download HTTP ' + downloaded.status);
        verify(
          downloaded.headers.get('content-range') ===
            `bytes ${start}-${end}/${bytes.length}`,
          'Download range mismatch',
        );
        downloadedHash.update(Buffer.from(await downloaded.arrayBuffer()));
      }
      verify(downloadedHash.digest('hex') === hash, 'Downloaded hash mismatch');
      console.log(
        JSON.stringify({
          role: index ? 'employee' : 'admin',
          projectId: project.id,
          sizeBytes: bytes.length,
          chunks: count,
          registered: true,
          downloadHashVerified: true,
          aiCalled: false,
        }),
      );
    } finally {
      if (cookie) {
        const out = await fetch(origin + '/api/auth/logout', {
          method: 'POST',
          headers: { origin, cookie, 'content-type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(30000),
        });
        await out.arrayBuffer();
        const session = await fetch(origin + '/api/auth/session', {
          headers: { cookie },
          signal: AbortSignal.timeout(30000),
        });
        verify(session.status === 401, 'Logout verification failed');
        await session.arrayBuffer();
        cookie = '';
      }
    }
  }
} catch (error) {
  console.error(
    JSON.stringify({
      phase,
      error: error instanceof Error ? error.message : 'Failure',
    }),
  );
  process.exitCode = 1;
}
