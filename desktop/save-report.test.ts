// @vitest-environment node
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { saveNewReport } from './save-report.mjs';
it('creates a report but never overwrites an existing source or report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qc-report-test-'));
  try {
    const source = join(dir, 'source.xlsx'),
      report = join(dir, 'report.xlsx');
    await writeFile(source, 'original');
    await expect(saveNewReport(source, new Uint8Array([1]))).rejects.toThrow(
      '덮어쓰지',
    );
    expect(await readFile(source, 'utf8')).toBe('original');
    await saveNewReport(report, new Uint8Array([1, 2]));
    await expect(saveNewReport(report, new Uint8Array([3]))).rejects.toThrow(
      '덮어쓰지',
    );
    expect([...(await readFile(report))]).toEqual([1, 2]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
