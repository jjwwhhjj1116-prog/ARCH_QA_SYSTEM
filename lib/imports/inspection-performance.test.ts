// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { inspectSourceFile } from './inspect-source-file';

describe('bounded synthetic inspection workload', () => {
  it('checks a small compressed workbook with larger XML without changing source bytes', async () => {
    const rows = Array.from(
      { length: 4000 },
      (_, i) =>
        `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>ITEM-${i}-${(i * 7919).toString(36)}</t></is></c><c r="B${i + 1}"><v>${i * 137}</v></c></row>`,
    ).join('');
    const body = zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'xl/workbook.xml': strToU8('<workbook/>'),
      'xl/worksheets/sheet1.xml': strToU8(
        `<worksheet><sheetData>${rows}</sheetData></worksheet>`,
      ),
    });
    const original = body.slice();
    const samples: number[] = [];
    for (let i = 0; i < 6; i++) {
      const started = process.cpuUsage();
      const result = await inspectSourceFile({
        filename: '합성산출서.xlsx',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body,
      });
      const elapsed = process.cpuUsage(started);
      if (i) samples.push((elapsed.user + elapsed.system) / 1000);
      expect(result.archiveEntryCount).toBe(3);
      expect(result.archiveUncompressedBytes).toBeGreaterThan(400000);
    }
    expect(body).toEqual(original);
    process.stdout.write(
      JSON.stringify({
        kind: 'local-node-cpu-not-cloudflare',
        compressedBytes: body.length,
        medianCpuMs: samples.sort((a, b) => a - b)[2],
      }) + '\n',
    );
  });
});
