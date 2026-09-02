import { describe, expect, it } from 'vitest';
import { deflateSync } from 'fflate';
import {
  MAX_SOURCE_BYTES,
  SourceInspectionError,
  inspectSourceFile,
} from './inspect-source-file';

describe('inspectSourceFile', () => {
  it('classifies a UTF-8 takeoff CSV and derives integrity metadata', async () => {
    const body = new TextEncoder().encode('품명,수량\n도장,12.5\n');
    const result = await inspectSourceFile({
      filename: ' 내부산출서.csv ',
      contentType: 'text/csv',
      body,
    });

    expect(result).toMatchObject({
      displayName: '내부산출서.csv',
      format: 'csv',
      documentKind: 'takeoff',
      csvRowCount: 2,
      sizeBytes: body.byteLength,
    });
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('classifies a valid minimal XLSX summary and reports archive totals', async () => {
    const body = fakeZip([
      { name: '[Content_Types].xml', compressed: 20, uncompressed: 30 },
      { name: 'xl/workbook.xml', compressed: 20, uncompressed: 40 },
      { name: 'xl/worksheets/sheet1.xml', compressed: 30, uncompressed: 80 },
    ]);
    const result = await inspectSourceFile({
      filename: '동별집계표.xlsx',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body,
    });

    expect(result).toMatchObject({
      format: 'xlsx',
      documentKind: 'summary',
      archiveEntryCount: 3,
    });
    expect(result.archiveUncompressedBytes).toBeGreaterThan(0);
  });

  it.each([
    ['../산출서.csv', 'FILE_NAME_INVALID'],
    ['산출서\u202Egnp.csv', 'FILE_NAME_INVALID'],
    ['산출서.xlsm', 'FILE_EXTENSION_UNSUPPORTED'],
  ])('rejects unsafe or unsupported filename %s', async (filename, code) => {
    await expectInspectionCode(
      inspectSourceFile({
        filename,
        contentType: 'text/csv',
        body: new TextEncoder().encode('a,b\n1,2'),
      }),
      code,
    );
  });

  it('rejects empty and oversized files before parsing', async () => {
    await expectInspectionCode(
      inspectSourceFile({
        filename: '산출서.csv',
        contentType: 'text/csv',
        body: new Uint8Array(),
      }),
      'FILE_EMPTY',
    );
    await expectInspectionCode(
      inspectSourceFile({
        filename: '산출서.csv',
        contentType: 'text/csv',
        body: new Uint8Array(MAX_SOURCE_BYTES + 1),
      }),
      'FILE_TOO_LARGE',
    );
  });

  it('rejects an extension and content-type mismatch', async () => {
    await expectInspectionCode(
      inspectSourceFile({
        filename: '산출서.csv',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: new TextEncoder().encode('a,b\n1,2'),
      }),
      'FILE_CONTENT_TYPE_MISMATCH',
    );
  });

  it('rejects ZIP bytes disguised as CSV', async () => {
    await expectInspectionCode(
      inspectSourceFile({
        filename: '산출서.csv',
        contentType: 'text/csv',
        body: fakeZip([
          { name: '[Content_Types].xml', compressed: 1, uncompressed: 1 },
          { name: 'xl/workbook.xml', compressed: 1, uncompressed: 1 },
        ]),
      }),
      'FILE_SIGNATURE_MISMATCH',
    );
  });

  it('rejects invalid UTF-8 and NUL-bearing CSV files', async () => {
    for (const body of [new Uint8Array([0xff]), new Uint8Array([65, 0, 66])]) {
      await expectInspectionCode(
        inspectSourceFile({
          filename: '산출서.csv',
          contentType: 'text/csv',
          body,
        }),
        body[0] === 0xff ? 'FILE_CSV_ENCODING' : 'FILE_SIGNATURE_MISMATCH',
      );
    }
  });

  it('rejects traversal, macros and missing required XLSX entries', async () => {
    const cases: Array<[ReturnType<typeof fakeZip>, string]> = [
      [
        fakeZip([
          { name: '[Content_Types].xml', compressed: 1, uncompressed: 1 },
          { name: 'xl/workbook.xml', compressed: 1, uncompressed: 1 },
          { name: '../evil.xml', compressed: 1, uncompressed: 1 },
        ]),
        'FILE_XLSX_INVALID',
      ],
      [
        fakeZip([
          { name: '[Content_Types].xml', compressed: 1, uncompressed: 1 },
          { name: 'xl/workbook.xml', compressed: 1, uncompressed: 1 },
          { name: 'xl/vbaProject.bin', compressed: 1, uncompressed: 1 },
        ]),
        'FILE_XLSX_MACRO',
      ],
      [
        fakeZip([
          { name: '[Content_Types].xml', compressed: 1, uncompressed: 1 },
          { name: 'xl/workbook.xml', compressed: 1, uncompressed: 1 },
          { name: 'xl/activeX/activeX1.bin', compressed: 1, uncompressed: 1 },
        ]),
        'FILE_XLSX_ACTIVE_CONTENT',
      ],
      [
        fakeZip([{ name: 'xl/workbook.xml', compressed: 1, uncompressed: 1 }]),
        'FILE_XLSX_INVALID',
      ],
    ];

    for (const [body, code] of cases) {
      await expectInspectionCode(
        inspectSourceFile({
          filename: '산출서.xlsx',
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body,
        }),
        code,
      );
    }
  });

  it('rejects duplicate archive paths', async () => {
    await expectInspectionCode(
      inspectSourceFile({
        filename: '산출서.xlsx',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: fakeZip([
          { name: '[Content_Types].xml', compressed: 1, uncompressed: 1 },
          { name: 'xl/workbook.xml', compressed: 1, uncompressed: 1 },
          { name: 'xl/workbook.xml', compressed: 1, uncompressed: 1 },
        ]),
      }),
      'FILE_XLSX_INVALID',
    );
  });

  it('rejects an excessive archive expansion ratio', async () => {
    await expectInspectionCode(
      inspectSourceFile({
        filename: '산출서.xlsx',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: fakeZip([
          {
            name: '[Content_Types].xml',
            compressed: 1,
            uncompressed: 50_000,
          },
          {
            name: 'xl/workbook.xml',
            compressed: 1,
            uncompressed: 50_000,
          },
        ]),
      }),
      'FILE_XLSX_LIMIT',
    );
  });

  it('records but never follows external workbook links', async () => {
    const result = await inspectSourceFile({
      filename: '외부산출서.xlsx',
      contentType: 'application/octet-stream',
      body: fakeZip([
        { name: '[Content_Types].xml', compressed: 10, uncompressed: 10 },
        { name: 'xl/workbook.xml', compressed: 10, uncompressed: 10 },
        {
          name: 'xl/externalLinks/externalLink1.xml',
          compressed: 10,
          uncompressed: 10,
        },
      ]),
    });
    expect(result.warnings).toEqual(['EXTERNAL_LINKS_PRESENT']);
  });

  it('rejects local-header confusion, invalid deflate, CRC and required XML', async () => {
    const cases = [
      fakeZip([
        {
          name: '[Content_Types].xml',
          localName: '../evil.xml',
          compressed: 1,
          uncompressed: 30,
        },
        { name: 'xl/workbook.xml', compressed: 1, uncompressed: 40 },
      ]),
      fakeZip([
        {
          name: '[Content_Types].xml',
          compressed: 1,
          uncompressed: 30,
          corruptPayload: true,
        },
        { name: 'xl/workbook.xml', compressed: 1, uncompressed: 40 },
      ]),
      fakeZip([
        {
          name: '[Content_Types].xml',
          compressed: 1,
          uncompressed: 30,
          corruptCrc: true,
        },
        { name: 'xl/workbook.xml', compressed: 1, uncompressed: 40 },
      ]),
      fakeZip([
        {
          name: '[Content_Types].xml',
          compressed: 1,
          uncompressed: 30,
          content: 'not xml',
        },
        { name: 'xl/workbook.xml', compressed: 1, uncompressed: 40 },
      ]),
    ];
    for (const body of cases) {
      await expectInspectionCode(
        inspectSourceFile({
          filename: '산출서.xlsx',
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body,
        }),
        'FILE_XLSX_INVALID',
      );
    }
  });

  it('detects external relationships without an externalLinks path', async () => {
    const result = await inspectSourceFile({
      filename: '산출서.xlsx',
      contentType: 'application/octet-stream',
      body: fakeZip([
        { name: '[Content_Types].xml', compressed: 1, uncompressed: 30 },
        { name: 'xl/workbook.xml', compressed: 1, uncompressed: 40 },
        {
          name: 'xl/_rels/workbook.xml.rels',
          compressed: 1,
          uncompressed: 80,
          content:
            '<Relationships><Relationship TargetMode="External" /></Relationships>',
        },
      ]),
    });
    expect(result.warnings).toEqual(['EXTERNAL_LINKS_PRESENT']);
  });

  it('accepts standard OOXML package relationships used by FIN workbooks', async () => {
    const result = await inspectSourceFile({
      filename: '가설산출서.xlsx',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: fakeZip([
        {
          name: '[Content_Types].xml',
          compressed: 1,
          uncompressed: 30,
          content:
            '<Types><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
        },
        { name: 'xl/workbook.xml', compressed: 1, uncompressed: 40 },
        {
          name: '_rels/.rels',
          compressed: 1,
          uncompressed: 120,
          content:
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>',
        },
        {
          name: 'xl/worksheets/_rels/sheet1.xml.rels',
          compressed: 1,
          uncompressed: 120,
          content:
            '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings" Target="../printerSettings/printerSettings1.bin"/></Relationships>',
        },
        {
          name: 'xl/printerSettings/printerSettings1.bin',
          compressed: 1,
          uncompressed: 8,
        },
      ]),
    });

    expect(result.format).toBe('xlsx');
    expect(result.warnings).toEqual([]);
  });

  it('bounds actual inflation when the ZIP directory understates expanded bytes', async () => {
    await expectInspectionCode(
      inspectSourceFile({
        filename: '산출서.xlsx',
        contentType: 'application/octet-stream',
        body: fakeZip([
          {
            name: '[Content_Types].xml',
            compressed: 1,
            uncompressed: 2 * 1024 * 1024,
            declaredUncompressed: 32,
          },
          { name: 'xl/workbook.xml', compressed: 1, uncompressed: 40 },
        ]),
      }),
      'FILE_XLSX_LIMIT',
    );
  });

  it.each([
    [
      '<Types><Override PartName="/xl/custom.bin" ContentType="application/vnd.ms-office.vbaProject" /></Types>',
      'FILE_XLSX_MACRO',
    ],
    [
      '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="custom.bin" /></Relationships>',
      'FILE_XLSX_ACTIVE_CONTENT',
    ],
    [
      '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="embedded.bin" /></Relationships>',
      'FILE_XLSX_ACTIVE_CONTENT',
    ],
    [
      '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package/?bypass=1#fragment" Target="embedded.bin" /></Relationships>',
      'FILE_XLSX_ACTIVE_CONTENT',
    ],
    [
      '<Types><Override PartName="/xl/active.bin" ContentType="application/vnd.ms-office.activeX+xml" /></Types>',
      'FILE_XLSX_ACTIVE_CONTENT',
    ],
  ])(
    'rejects active content declared through OOXML metadata',
    async (declaration, code) => {
      await expectInspectionCode(
        inspectSourceFile({
          filename: '산출서.xlsx',
          contentType: 'application/octet-stream',
          body: fakeZip([
            {
              name: '[Content_Types].xml',
              compressed: 1,
              uncompressed: 30,
              content: declaration.includes('<Types>')
                ? declaration
                : '<Types></Types>',
            },
            { name: 'xl/workbook.xml', compressed: 1, uncompressed: 40 },
            ...(declaration.includes('<Relationships>')
              ? [
                  {
                    name: 'xl/_rels/workbook.xml.rels',
                    compressed: 1,
                    uncompressed: 80,
                    content: declaration,
                  },
                ]
              : []),
          ]),
        }),
        code,
      );
    },
  );

  it('does not interpret unrelated worksheet Type attributes as relationships', async () => {
    const result = await inspectSourceFile({
      filename: '산출서.xlsx',
      contentType: 'application/octet-stream',
      body: fakeZip([
        {
          name: '[Content_Types].xml',
          compressed: 1,
          uncompressed: 30,
          content: '<Types></Types>',
        },
        { name: 'xl/workbook.xml', compressed: 1, uncompressed: 40 },
        {
          name: 'xl/worksheets/sheet1.xml',
          compressed: 1,
          uncompressed: 80,
          content: '<worksheet><cell Type="oleObject"/></worksheet>',
        },
      ]),
    });

    expect(result.format).toBe('xlsx');
  });
});

async function expectInspectionCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error('inspection unexpectedly succeeded');
  } catch (error) {
    expect(error).toBeInstanceOf(SourceInspectionError);
    expect((error as SourceInspectionError).code).toBe(code);
  }
}

function fakeZip(
  entries: Array<{
    name: string;
    compressed: number;
    uncompressed: number;
    localName?: string;
    content?: string;
    corruptPayload?: boolean;
    corruptCrc?: boolean;
    declaredUncompressed?: number;
  }>,
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const localName = encoder.encode(entry.localName ?? entry.name);
    const content = entryContent(entry.name, entry.uncompressed, entry.content);
    const compressedBody = Uint8Array.from(deflateSync(content));
    if (entry.corruptPayload && compressedBody.length > 0) {
      compressedBody[Math.floor(compressedBody.length / 2)] ^= 0xff;
    }
    const expectedCrc = crc32(content);
    const storedCrc = entry.corruptCrc ? expectedCrc ^ 0xffffffff : expectedCrc;
    const local = new Uint8Array(30 + localName.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(8, 8, true);
    localView.setUint32(14, storedCrc, true);
    localView.setUint32(18, compressedBody.length, true);
    localView.setUint32(22, entry.declaredUncompressed ?? content.length, true);
    localView.setUint16(26, localName.length, true);
    local.set(localName, 30);
    localParts.push(local, compressedBody);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(10, 8, true);
    centralView.setUint32(16, storedCrc, true);
    centralView.setUint32(20, compressedBody.length, true);
    centralView.setUint32(
      24,
      entry.declaredUncompressed ?? content.length,
      true,
    );
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length + compressedBody.length;
  }

  const directory = concat(centralParts);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, directory.length, true);
  eocdView.setUint32(16, localOffset, true);
  return concat([...localParts, directory, eocd]);
}

function entryContent(
  name: string,
  requestedLength: number,
  supplied?: string,
): Uint8Array<ArrayBuffer> {
  const base =
    supplied ??
    (name.toLowerCase() === '[content_types].xml'
      ? '<Types></Types>'
      : name.toLowerCase() === 'xl/workbook.xml'
        ? '<workbook></workbook>'
        : name.toLowerCase().endsWith('.xml') ||
            name.toLowerCase().endsWith('.rels')
          ? '<root></root>'
          : 'binary');
  const targetLength = Math.max(requestedLength, base.length);
  return new TextEncoder().encode(base.padEnd(targetLength, ' '));
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
