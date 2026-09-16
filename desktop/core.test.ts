// @vitest-environment node
import { createHash } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { inspectAndReview, inspectSources } from './core';

const fixture = () => ({
  filename: '합성산출서.csv',
  bytes: new TextEncoder().encode(
    '합성산출서\n부위,품명,규격,단위,산식,물량\n벽,도장,,㎡,1/0,10\n벽,도장,,㎡,2*3,6',
  ),
});

describe('local baseline pipeline', () => {
  it('caps aggregate preview text while retaining all source inventories', async () => {
    const row = Array(64).fill('한'.repeat(220)).join(',');
    const bytes = new TextEncoder().encode(Array(30).fill(row).join('\n'));
    const inputs = Array.from({ length: 4 }, (_, index) => ({
      filename: `bounded-${index}.csv`,
      bytes,
    }));
    const preview = await inspectSources(inputs);
    expect(preview.files).toHaveLength(4);
    const characters = preview.files
      .flatMap((file) =>
        file.sheets.flatMap((sheet) =>
          sheet.preview.flatMap((item) => item.cells),
        ),
      )
      .reduce((total, cell) => total + cell.length, 0);
    expect(characters).toBe(1_000_000);
    expect(preview.limitations.join(' ')).toContain('전체 표시 한도');
  });
  it('applies confirmed manual columns and snapshots source and mapping without mutating the draft', async () => {
    const input = {
      filename: 'custom.csv',
      bytes: new TextEncoder().encode('label,calc,total\n벽,1/0,0\n천장,1/0,'),
    };
    const preview = await inspectSources([input]);
    const file = preview.files[0]!;
    const mapping = structuredClone(file.sheets[0]!.mapping);
    mapping.kind = 'detail';
    mapping.confirmed = true;
    mapping.columns.item = 0;
    mapping.columns.formula = 1;
    mapping.columns.quantity = 2;
    const original = structuredClone(mapping);
    const { run, report } = await inspectAndReview([input], undefined, [
      { filename: file.filename, sha256: file.sha256, mapping },
    ]);
    expect(mapping).toEqual(original);
    expect(run.rowCount).toBe(2);
    expect(run.rows[0]?.values.quantity).toBe('0');
    expect(run.rows[1]?.values.quantity).toBe('');
    expect(run.rows[0]?.ref).toMatchObject({
      sha256: file.sha256,
      row: 2,
      cell: 'B2',
    });
    expect(run.mappings[0]?.sourceVersionId).not.toBe(mapping.sourceVersionId);
    expect(run.mappings[0]?.columns).toEqual(mapping.columns);
    expect(strFromU8(unzipSync(report)['xl/worksheets/sheet2.xml']!)).toContain(
      file.sha256,
    );
    mapping.confirmed = false;
    const held = await inspectAndReview([input], undefined, [
      { filename: file.filename, sha256: file.sha256, mapping },
    ]);
    expect(held.run.rowCount).toBe(0);
    expect(held.run.limitations.join(' ')).toContain('미평가');
  });

  it('rejects stale, duplicate, invalid sheet/header/column and missing required manual mappings', async () => {
    const input = fixture();
    const { files } = await inspectSources([input]);
    const file = files[0]!;
    const override = {
      filename: file.filename,
      sha256: file.sha256,
      mapping: file.sheets[0]!.mapping,
    };
    for (const changed of [
      { ...override, sha256: '0'.repeat(64) },
      { ...override, mapping: { ...override.mapping, sheet: 'missing' } },
      { ...override, mapping: { ...override.mapping, headerRow: 1000 } },
      {
        ...override,
        mapping: {
          ...override.mapping,
          columns: { ...override.mapping.columns, formula: 200 },
        },
      },
      {
        ...override,
        mapping: {
          ...override.mapping,
          columns: { ...override.mapping.columns, formula: 0 },
        },
      },
      {
        ...override,
        mapping: {
          ...override.mapping,
          columns: { ...override.mapping.columns, formula: null },
        },
      },
    ])
      await expect(
        inspectAndReview([input], undefined, [changed]),
      ).rejects.toThrow('매핑');
    await expect(
      inspectAndReview([input], undefined, [override, override]),
    ).rejects.toThrow('중복');
    const changedBytes = {
      ...input,
      bytes: new TextEncoder().encode(
        '산출서\n부위,품명,규격,단위,산식,물량\n벽,도장,,㎡,2*3,6',
      ),
    };
    await expect(
      inspectAndReview([changedBytes], undefined, [override]),
    ).rejects.toThrow('원본');
  });

  it('bounds preview at actual row numbers and does not hide other valid files on inspection failure', async () => {
    const cells = Array.from({ length: 70 }, () => '가'.repeat(220)).join(',');
    const { files, limitations } = await inspectSources([
      {
        filename: 'wide.csv',
        bytes: new TextEncoder().encode(
          Array.from({ length: 35 }, () => cells).join('\n'),
        ),
      },
      { filename: 'bad.xlsx', bytes: new TextEncoder().encode('broken') },
    ]);
    const preview = files[0]!.sheets[0]!.preview;
    expect(preview).toHaveLength(30);
    expect(preview[29]?.row).toBe(30);
    expect(preview[0]?.cells).toHaveLength(64);
    expect(preview[0]?.cells[0]).toHaveLength(200);
    expect(limitations.join(' ')).toContain('bad.xlsx: 파일 미평가');
  });
  it('keeps zero-finding source lineage and authenticated project context in the report', async () => {
    const input = {
      filename: '정상합성.csv',
      bytes: new TextEncoder().encode(
        '산출서\n부위,품명,규격,단위,산식,물량\n벽,도장,,㎡,2*3,6',
      ),
    };
    const { run, files, report } = await inspectAndReview(
      [
        input,
        {
          filename: '미매핑.csv',
          bytes: new TextEncoder().encode('alpha,beta\n1,2'),
        },
      ],
      { projectId: 'test-project', actorId: 'synthetic-member' },
    );
    expect(run.findings).toHaveLength(0);
    const scope = strFromU8(unzipSync(report)['xl/worksheets/sheet2.xml']!);
    for (const file of files) {
      expect(scope).toContain(file.filename);
      expect(scope).toContain(file.sha256);
    }
    expect(scope).toContain('test-project');
    expect(scope).toContain('synthetic-member');
    expect(scope).toContain('미평가');
    expect(scope).toContain('매핑 스냅샷');
  });
  it('preserves source evidence and produces a no-AI XLSX report', async () => {
    const input = fixture();
    const original = input.bytes.slice();
    const { run, files, report } = await inspectAndReview([input]);
    expect(input.bytes).toEqual(original);
    expect(files[0]?.sha256).toBe(
      createHash('sha256').update(original).digest('hex'),
    );
    expect(run.kind).toBe('baseline');
    expect(run.ai).toBeUndefined();
    expect(run.rowCount).toBe(2);
    expect(run.findings).toHaveLength(1);
    expect(run.rows[0]?.ref).toMatchObject({
      filename: input.filename,
      sha256: files[0]?.sha256,
      row: 3,
    });
    expect(run.rows[0]?.ref.sourceVersionId).toBe(
      run.sources[0]?.sourceVersionId,
    );
    expect(run.limitations.join(' ')).toContain(
      '외부 AI를 호출하지 않았습니다',
    );
    const archive = unzipSync(report);
    expect(archive['xl/workbook.xml']).toBeDefined();
    expect(strFromU8(archive['xl/worksheets/sheet1.xml']!)).toContain(
      files[0]!.sha256,
    );
  });

  it('does not evaluate unknown mappings or pretend unsupported files succeeded', async () => {
    const { run, files } = await inspectAndReview([
      {
        filename: '미지.csv',
        bytes: new TextEncoder().encode('alpha,beta\n1,2'),
      },
      {
        filename: '손상.xlsx',
        bytes: new TextEncoder().encode('not a workbook'),
      },
      fixture(),
    ]);
    expect(files).toHaveLength(2);
    expect(run.mappings[0]?.confirmed).toBe(false);
    expect(run.limitations.join(' ')).toContain('이 시트는 미평가');
    expect(run.limitations.join(' ')).toContain('손상.xlsx: 파일 미평가');
    expect(run.rowCount).toBe(2);
  });

  it('keeps reruns separate and reports an all-failed batch as unevaluated', async () => {
    const first = await inspectAndReview([fixture()]);
    const second = await inspectAndReview([fixture()]);
    expect(first.run.id).not.toBe(second.run.id);
    expect(first.files).toEqual(second.files);
    const failed = await inspectAndReview([
      { filename: 'empty.csv', bytes: new Uint8Array() },
    ]);
    expect(failed.files).toEqual([]);
    expect(failed.run.rowCount).toBe(0);
    expect(failed.run.limitations.join(' ')).toContain('파일 미평가');
    await expect(inspectAndReview([])).rejects.toThrow('1~32');
  });
});
