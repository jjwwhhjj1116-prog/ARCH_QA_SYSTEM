// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { loadRegisteredSource } from './registered-source';
import { inspectAndReview } from './core';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const selection = {
  projectId: id(1),
  caseId: id(2),
  packageId: id(3),
  sourceVersionId: id(4),
};
function setup(bytes = new TextEncoder().encode('품명,산식,물량\n도장,1/0,0')) {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const pkg = {
    id: id(3),
    projectId: id(1),
    reviewCaseId: id(2),
    version: 1,
    status: 'receiving',
    files: [
      {
        uploadId: id(5),
        sourceFileId: id(6),
        sourceVersionId: id(4),
        filename: '합성산출서.csv',
        format: 'csv',
        sizeBytes: bytes.length,
        status: 'uploaded',
        uploadState: 'uploaded',
      },
    ],
  };
  const api = vi.fn(async () => [structuredClone(pkg)]);
  const current = vi.fn(async () => {});
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const match = new Headers(init?.headers)
      .get('range')!
      .match(/bytes=(\d+)-(\d+)/)!;
    const start = Number(match[1]),
      end = Number(match[2]);
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: {
        'content-range': `bytes ${start}-${end}/${bytes.length}`,
        'x-original-sha256': sha256,
      },
    });
  });
  return { bytes, sha256, pkg, api, current, fetcher };
}
describe('registered Drive original to local inspection transport', () => {
  it('downloads, checks digest, retains lineage and feeds the actual local baseline/report', async () => {
    const s = setup();
    const source = await loadRegisteredSource(
      s.api,
      s.fetcher,
      selection,
      s.current,
    );
    expect(source.bytes).toEqual(s.bytes);
    expect(source.provenance).toMatchObject({
      ...selection,
      sha256: s.sha256,
      uploadId: id(5),
    });
    expect(source.serverInspection).toBe('pending');
    expect(s.pkg.files[0]!.status).toBe('uploaded');
    const context = {
      projectId: selection.projectId,
      caseId: selection.caseId,
      actorId: 'synthetic',
    };
    const result = await inspectAndReview([source], context);
    expect(result.files[0]?.sha256).toBe(s.sha256);
    expect(result.report.byteLength).toBeGreaterThan(100);
    expect(result.run.trial).toBe(true);
    expect(result.run.caseId).toBe(selection.caseId);
    expect(result.run.mappings[0]?.sourceVersionId).toBe(
      selection.sourceVersionId,
    );
    await expect(
      inspectAndReview([source], { ...context, caseId: id(99) }),
    ).rejects.toThrow('프로젝트');
    await expect(inspectAndReview([source, source], context)).rejects.toThrow(
      '중복',
    );
    await expect(
      inspectAndReview(
        [{ ...source, bytes: new TextEncoder().encode('다른,파일') }],
        context,
      ),
    ).rejects.toThrow('해시');
    expect(s.api).toHaveBeenCalledTimes(2);
    expect(s.fetcher.mock.calls[0]?.[1]?.redirect).toBe('error');
  });
  it.each([
    'foreign',
    'superseded',
    'blocked',
    'pending',
    'too-large',
    'duplicate',
  ])('rejects %s before byte retrieval', async (kind) => {
    const s = setup();
    if (kind === 'foreign') s.pkg.projectId = id(99);
    if (kind === 'superseded') Object.assign(s.pkg, { supersededBy: id(99) });
    if (kind === 'blocked') s.pkg.status = 'blocked';
    if (kind === 'pending') s.pkg.files[0]!.status = 'upload_pending';
    if (kind === 'too-large') s.pkg.files[0]!.sizeBytes = 20 * 1048576 + 1;
    if (kind === 'duplicate') s.pkg.files.push({ ...s.pkg.files[0]! });
    await expect(
      loadRegisteredSource(s.api, s.fetcher, selection, s.current),
    ).rejects.toThrow();
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it('rejects replaced source after transfer rather than releasing stale bytes', async () => {
    const s = setup();
    s.api
      .mockImplementationOnce(async () => [structuredClone(s.pkg)])
      .mockImplementationOnce(async () => []);
    await expect(
      loadRegisteredSource(s.api, s.fetcher, selection, s.current),
    ).rejects.toThrow('묶음');
  });
  it('stops before the next chunk when the account changes', async () => {
    const s = setup(new Uint8Array(1048580).fill(65));
    s.current.mockImplementation(async () => {
      if (s.fetcher.mock.calls.length >= 1) throw new Error('계정 변경');
    });
    await expect(
      loadRegisteredSource(s.api, s.fetcher, selection, s.current),
    ).rejects.toThrow('계정 변경');
    expect(s.fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects corruption and authentication failure without returning a source', async () => {
    for (const status of [206, 401]) {
      const s = setup();
      s.fetcher.mockImplementation(
        async () =>
          new Response(new Uint8Array(s.bytes.length), {
            status,
            headers: {
              'content-range': `bytes 0-${s.bytes.length - 1}/${s.bytes.length}`,
              'x-original-sha256': s.sha256,
            },
          }),
      );
      await expect(
        loadRegisteredSource(s.api, s.fetcher, selection, s.current),
      ).rejects.toThrow();
    }
  });
  it('checks the context again after the final asynchronous digest', async () => {
    const s = setup();
    let changed = false;
    let digests = 0;
    const original = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementation(async (...args) => {
        const result = await original(...args);
        if (++digests === 2) changed = true;
        return result;
      });
    s.current.mockImplementation(async () => {
      if (changed) throw new Error('계정 변경');
    });
    try {
      await expect(
        loadRegisteredSource(s.api, s.fetcher, selection, s.current),
      ).rejects.toThrow('계정 변경');
    } finally {
      spy.mockRestore();
    }
  });
});
