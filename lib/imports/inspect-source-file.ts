import { Inflate } from 'fflate';
import { canonicalSourceFilename } from './source-filename';

export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_XLSX_ENTRIES = 2_000;
export const MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
export const MAX_XLSX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
export const MAX_XLSX_EXPANSION_RATIO = 100;

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const GENERIC_CONTENT_TYPE = 'application/octet-stream';
const CSV_CONTENT_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  GENERIC_CONTENT_TYPE,
]);

export type SourceFormat = 'xlsx' | 'csv';
export type SourceDocumentKind = 'takeoff' | 'summary' | 'unknown';

export type SourceDeclaration = {
  displayName: string;
  format: SourceFormat;
  documentKind: SourceDocumentKind;
  claimedContentType: string;
  sizeBytes: number;
};

export type SourceInspection = {
  displayName: string;
  format: SourceFormat;
  documentKind: SourceDocumentKind;
  claimedContentType: string;
  detectedContentType: string;
  sizeBytes: number;
  sha256: string;
  archiveEntryCount: number | null;
  archiveUncompressedBytes: number | null;
  csvRowCount: number | null;
  warnings: string[];
};

export type SourceInspectionCode =
  | 'FILE_EMPTY'
  | 'FILE_TOO_LARGE'
  | 'FILE_SIZE_MISMATCH'
  | 'FILE_NAME_INVALID'
  | 'FILE_EXTENSION_UNSUPPORTED'
  | 'FILE_CONTENT_TYPE_MISMATCH'
  | 'FILE_SIGNATURE_MISMATCH'
  | 'FILE_XLSX_INVALID'
  | 'FILE_XLSX_LIMIT'
  | 'FILE_XLSX_MACRO'
  | 'FILE_XLSX_ACTIVE_CONTENT'
  | 'FILE_CSV_ENCODING';

export class SourceInspectionError extends Error {
  constructor(
    readonly code: SourceInspectionCode,
    message: string,
  ) {
    super(message);
    this.name = 'SourceInspectionError';
  }
}

export async function inspectSourceFile(input: {
  filename: string;
  contentType: string;
  body: ArrayBuffer | ArrayBufferView;
}): Promise<SourceInspection> {
  const bytes = snapshotBytes(input.body);
  const declaration = validateSourceDeclaration({
    filename: input.filename,
    contentType: input.contentType,
    sizeBytes: bytes.byteLength,
  });

  const base = {
    ...declaration,
    sha256: await sha256Hex(bytes),
  } as const;

  if (declaration.format === 'xlsx') {
    const archive = inspectXlsxArchive(bytes);
    return {
      ...base,
      detectedContentType: XLSX_CONTENT_TYPE,
      archiveEntryCount: archive.entryCount,
      archiveUncompressedBytes: archive.uncompressedBytes,
      csvRowCount: null,
      warnings: archive.warnings,
    };
  }

  const csv = inspectCsv(bytes);
  return {
    ...base,
    detectedContentType: 'text/csv; charset=utf-8',
    archiveEntryCount: null,
    archiveUncompressedBytes: null,
    csvRowCount: csv.rowCount,
    warnings: csv.warnings,
  };
}

export function validateSourceDeclaration(input: {
  filename: string;
  contentType: string;
  sizeBytes: number;
}): SourceDeclaration {
  const displayName = normalizeDisplayName(input.filename);
  const format = sourceFormat(displayName);
  const claimedContentType = input.contentType.trim().toLowerCase();
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new SourceInspectionError(
      'FILE_EMPTY',
      '파일 크기는 1바이트 이상이어야 합니다.',
    );
  }
  if (input.sizeBytes > MAX_SOURCE_BYTES) {
    throw new SourceInspectionError(
      'FILE_TOO_LARGE',
      `파일은 ${MAX_SOURCE_BYTES}바이트를 초과할 수 없습니다.`,
    );
  }
  assertContentType(
    claimedContentType,
    format === 'xlsx'
      ? new Set([XLSX_CONTENT_TYPE, GENERIC_CONTENT_TYPE])
      : CSV_CONTENT_TYPES,
  );
  return {
    displayName,
    format,
    documentKind: documentKind(displayName),
    claimedContentType,
    sizeBytes: input.sizeBytes,
  };
}

function normalizeDisplayName(filename: string): string {
  try {
    return canonicalSourceFilename(filename);
  } catch {
    throw new SourceInspectionError(
      'FILE_NAME_INVALID',
      '파일명은 1자 이상 180자 이하여야 합니다.',
    );
  }
}

function sourceFormat(filename: string): SourceFormat {
  const extension = filename.split('.').at(-1)?.toLowerCase();
  if (extension === 'xlsx' || extension === 'csv') return extension;
  throw new SourceInspectionError(
    'FILE_EXTENSION_UNSUPPORTED',
    '현재는 XLSX와 CSV 산출서·집계표만 등록할 수 있습니다.',
  );
}

function documentKind(filename: string): SourceDocumentKind {
  if (filename.includes('산출서')) return 'takeoff';
  if (filename.includes('집계표')) return 'summary';
  return 'unknown';
}

function assertContentType(actual: string, allowed: Set<string>): void {
  if (!allowed.has(actual)) {
    throw new SourceInspectionError(
      'FILE_CONTENT_TYPE_MISMATCH',
      '파일 확장자와 선언된 콘텐츠 유형이 일치하지 않습니다.',
    );
  }
}

function inspectCsv(bytes: Uint8Array<ArrayBuffer>): {
  rowCount: number;
  warnings: string[];
} {
  if (hasZipSignature(bytes) || bytes.includes(0)) {
    throw new SourceInspectionError(
      'FILE_SIGNATURE_MISMATCH',
      'CSV 파일 서명이 올바르지 않습니다.',
    );
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new SourceInspectionError(
      'FILE_CSV_ENCODING',
      'CSV는 현재 UTF-8 인코딩만 지원합니다.',
    );
  }
  const normalized = text.replace(/^\uFEFF/u, '');
  const rowCount = normalized.length
    ? normalized.split(/\r\n|\n|\r/u).filter((row) => row.length > 0).length
    : 0;
  if (rowCount === 0) {
    throw new SourceInspectionError('FILE_EMPTY', '내용이 없는 CSV입니다.');
  }
  return { rowCount, warnings: [] };
}

function inspectXlsxArchive(bytes: Uint8Array<ArrayBuffer>): {
  entryCount: number;
  uncompressedBytes: number;
  warnings: string[];
} {
  if (!hasZipSignature(bytes)) {
    throw new SourceInspectionError(
      'FILE_SIGNATURE_MISMATCH',
      'XLSX ZIP 서명이 올바르지 않습니다.',
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  const diskNumber = view.getUint16(eocd + 4, true);
  const directoryDisk = view.getUint16(eocd + 6, true);
  const diskEntryCount = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  const commentLength = view.getUint16(eocd + 20, true);

  if (
    diskNumber !== 0 ||
    directoryDisk !== 0 ||
    diskEntryCount !== entryCount ||
    entryCount === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff ||
    eocd + 22 + commentLength !== bytes.byteLength
  ) {
    throw new SourceInspectionError(
      'FILE_XLSX_INVALID',
      '다중 디스크 및 ZIP64 XLSX는 지원하지 않습니다.',
    );
  }
  if (entryCount === 0 || entryCount > MAX_XLSX_ENTRIES) {
    throw new SourceInspectionError(
      'FILE_XLSX_LIMIT',
      'XLSX 내부 파일 수가 허용 범위를 벗어났습니다.',
    );
  }
  if (directoryOffset + directorySize > eocd) {
    throw new SourceInspectionError(
      'FILE_XLSX_INVALID',
      'XLSX 중앙 디렉터리 범위가 올바르지 않습니다.',
    );
  }

  let cursor = directoryOffset;
  let compressedBytes = 0;
  let uncompressedBytes = 0;
  let hasContentTypes = false;
  let hasWorkbook = false;
  const warnings = new Set<string>();
  const entryNames = new Set<string>();
  const localRanges: Array<{ start: number; end: number }> = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });

  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > bytes.byteLength ||
      view.getUint32(cursor, true) !== 0x02014b50
    ) {
      throw new SourceInspectionError(
        'FILE_XLSX_INVALID',
        'XLSX 중앙 디렉터리 항목이 손상되었습니다.',
      );
    }
    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressed = view.getUint32(cursor + 20, true);
    const uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > bytes.byteLength || nameLength === 0) {
      throw new SourceInspectionError(
        'FILE_XLSX_INVALID',
        'XLSX 내부 경로가 손상되었습니다.',
      );
    }
    if ((flags & 0x41) !== 0) {
      throw new SourceInspectionError(
        'FILE_XLSX_INVALID',
        '암호화된 XLSX는 검수할 수 없습니다.',
      );
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new SourceInspectionError(
        'FILE_XLSX_INVALID',
        '지원하지 않는 XLSX 압축 방식입니다.',
      );
    }
    if (uncompressed > MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES) {
      throw new SourceInspectionError(
        'FILE_XLSX_LIMIT',
        'XLSX 내부 단일 파일의 압축 해제 크기 제한을 초과했습니다.',
      );
    }
    compressedBytes += compressed;
    uncompressedBytes += uncompressed;
    assertArchiveExpansionLimits(compressedBytes, uncompressedBytes);

    const centralNameBytes = bytes.subarray(
      cursor + 46,
      cursor + 46 + nameLength,
    );
    let name: string;
    try {
      name = decoder.decode(centralNameBytes);
    } catch {
      throw new SourceInspectionError(
        'FILE_XLSX_INVALID',
        'XLSX 내부 경로 인코딩이 올바르지 않습니다.',
      );
    }
    const normalizedName = name.replace(/\\/gu, '/');
    if (
      normalizedName.startsWith('/') ||
      normalizedName.split('/').some((segment) => segment === '..')
    ) {
      throw new SourceInspectionError(
        'FILE_XLSX_INVALID',
        'XLSX 내부 경로 탐색 항목을 차단했습니다.',
      );
    }
    if (entryNames.has(normalizedName)) {
      throw new SourceInspectionError(
        'FILE_XLSX_INVALID',
        'XLSX 내부에 중복 경로가 있습니다.',
      );
    }
    entryNames.add(normalizedName);
    const local = readLocalEntry(
      bytes,
      view,
      directoryOffset,
      localOffset,
      compressed,
      uncompressed,
      expectedCrc,
      compressionMethod,
      flags,
      centralNameBytes,
    );
    localRanges.push({ start: localOffset, end: local.payloadEnd });
    const expanded = expandEntry(
      local.payload,
      compressionMethod,
      uncompressed,
    );
    if (
      expanded.byteLength !== uncompressed ||
      crc32(expanded) !== expectedCrc
    ) {
      throw new SourceInspectionError(
        'FILE_XLSX_INVALID',
        'XLSX 내부 파일의 크기 또는 CRC가 올바르지 않습니다.',
      );
    }
    const lowerName = normalizedName.toLowerCase();
    if (lowerName.endsWith('.xml') || lowerName.endsWith('.rels')) {
      inspectXmlEntry(lowerName, expanded, decoder, warnings);
    }
    if (lowerName === '[content_types].xml') {
      assertXmlRoot(expanded, decoder, 'Types');
      hasContentTypes = true;
    }
    if (lowerName === 'xl/workbook.xml') {
      assertXmlRoot(expanded, decoder, 'workbook');
      hasWorkbook = true;
    }
    if (
      lowerName.endsWith('/vbaproject.bin') ||
      lowerName === 'vbaproject.bin'
    ) {
      throw new SourceInspectionError(
        'FILE_XLSX_MACRO',
        '매크로가 포함된 통합문서는 등록할 수 없습니다.',
      );
    }
    if (
      lowerName.startsWith('xl/activex/') ||
      lowerName.startsWith('xl/embeddings/')
    ) {
      throw new SourceInspectionError(
        'FILE_XLSX_ACTIVE_CONTENT',
        'ActiveX 또는 포함 개체가 있는 통합문서는 등록할 수 없습니다.',
      );
    }
    if (lowerName.startsWith('xl/externallinks/')) {
      warnings.add('EXTERNAL_LINKS_PRESENT');
    }
    cursor = next;
  }

  if (cursor !== directoryOffset + directorySize) {
    throw new SourceInspectionError(
      'FILE_XLSX_INVALID',
      'XLSX 중앙 디렉터리 크기가 실제 항목과 일치하지 않습니다.',
    );
  }
  localRanges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < localRanges.length; index += 1) {
    if (localRanges[index].start < localRanges[index - 1].end) {
      throw new SourceInspectionError(
        'FILE_XLSX_INVALID',
        'XLSX 내부 파일 영역이 서로 겹칩니다.',
      );
    }
  }

  if (!hasContentTypes || !hasWorkbook) {
    throw new SourceInspectionError(
      'FILE_XLSX_INVALID',
      '필수 XLSX 문서 항목이 없습니다.',
    );
  }
  return { entryCount, uncompressedBytes, warnings: [...warnings].sort() };
}

function assertArchiveExpansionLimits(
  compressedBytes: number,
  uncompressedBytes: number,
): void {
  const expansionRatio = uncompressedBytes / Math.max(compressedBytes, 1);
  if (
    uncompressedBytes > MAX_XLSX_UNCOMPRESSED_BYTES ||
    expansionRatio > MAX_XLSX_EXPANSION_RATIO
  ) {
    throw new SourceInspectionError(
      'FILE_XLSX_LIMIT',
      'XLSX 압축 해제 크기 또는 압축률 제한을 초과했습니다.',
    );
  }
}

function hasZipSignature(bytes: Uint8Array<ArrayBuffer>): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimumOffset = Math.max(0, view.byteLength - 65_557);
  for (
    let offset = view.byteLength - 22;
    offset >= minimumOffset;
    offset -= 1
  ) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new SourceInspectionError(
    'FILE_XLSX_INVALID',
    'XLSX 중앙 디렉터리를 찾을 수 없습니다.',
  );
}

function readLocalEntry(
  bytes: Uint8Array<ArrayBuffer>,
  view: DataView,
  directoryOffset: number,
  localOffset: number,
  compressedSize: number,
  uncompressedSize: number,
  expectedCrc: number,
  compressionMethod: number,
  flags: number,
  centralName: Uint8Array<ArrayBuffer>,
): { payload: Uint8Array<ArrayBuffer>; payloadEnd: number } {
  if (
    localOffset + 30 > directoryOffset ||
    view.getUint32(localOffset, true) !== 0x04034b50
  ) {
    throw new SourceInspectionError(
      'FILE_XLSX_INVALID',
      'XLSX 로컬 파일 항목이 손상되었습니다.',
    );
  }
  const localFlags = view.getUint16(localOffset + 6, true);
  const localMethod = view.getUint16(localOffset + 8, true);
  const localCrc = view.getUint32(localOffset + 14, true);
  const localCompressed = view.getUint32(localOffset + 18, true);
  const localUncompressed = view.getUint32(localOffset + 22, true);
  const localNameLength = view.getUint16(localOffset + 26, true);
  const localExtraLength = view.getUint16(localOffset + 28, true);
  const payloadOffset = localOffset + 30 + localNameLength + localExtraLength;
  const payloadEnd = payloadOffset + compressedSize;
  const localName = bytes.subarray(
    localOffset + 30,
    localOffset + 30 + localNameLength,
  );
  if (
    (localFlags & 0x41) !== 0 ||
    localFlags !== flags ||
    localMethod !== compressionMethod ||
    localNameLength !== centralName.byteLength ||
    !bytesEqual(localName, centralName) ||
    payloadEnd > directoryOffset ||
    ((flags & 0x8) === 0 &&
      (localCrc !== expectedCrc ||
        localCompressed !== compressedSize ||
        localUncompressed !== uncompressedSize))
  ) {
    throw new SourceInspectionError(
      'FILE_XLSX_INVALID',
      'XLSX 압축 데이터 범위가 올바르지 않습니다.',
    );
  }
  return { payload: bytes.subarray(payloadOffset, payloadEnd), payloadEnd };
}

function expandEntry(
  payload: Uint8Array<ArrayBuffer>,
  compressionMethod: number,
  expectedSize: number,
): Uint8Array<ArrayBufferLike> {
  if (compressionMethod === 0) return payload;
  const chunks: Uint8Array<ArrayBufferLike>[] = [];
  let expandedSize = 0;
  try {
    const inflater = new Inflate((chunk) => {
      expandedSize += chunk.byteLength;
      if (
        expandedSize > expectedSize ||
        expandedSize > MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES
      ) {
        throw new SourceInspectionError(
          'FILE_XLSX_LIMIT',
          'XLSX 내부 파일의 실제 압축 해제 크기가 선언값을 초과했습니다.',
        );
      }
      chunks.push(Uint8Array.from(chunk));
    });
    const chunkSize = 256;
    for (let offset = 0; offset < payload.byteLength; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, payload.byteLength);
      inflater.push(payload.subarray(offset, end), end === payload.byteLength);
    }
    const expanded = new Uint8Array(expandedSize);
    let offset = 0;
    for (const chunk of chunks) {
      expanded.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return expanded;
  } catch (error) {
    if (error instanceof SourceInspectionError) throw error;
    throw new SourceInspectionError(
      'FILE_XLSX_INVALID',
      'XLSX 내부 압축 데이터를 해제할 수 없습니다.',
    );
  }
}

function inspectXmlEntry(
  name: string,
  bytes: Uint8Array<ArrayBufferLike>,
  decoder: TextDecoder,
  warnings: Set<string>,
): void {
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    throw new SourceInspectionError(
      'FILE_XLSX_INVALID',
      'XLSX XML 인코딩이 올바르지 않습니다.',
    );
  }
  if (/<!DOCTYPE|<!ENTITY/iu.test(text)) {
    throw new SourceInspectionError(
      'FILE_XLSX_ACTIVE_CONTENT',
      'DTD 또는 외부 엔터티가 있는 통합문서는 등록할 수 없습니다.',
    );
  }
  validateXmlAndRoot(text);
  assertNoActiveContentDeclaration(text);
  if (
    name.startsWith('xl/externallinks/') ||
    /TargetMode\s*=\s*["']External["']/iu.test(text)
  ) {
    warnings.add('EXTERNAL_LINKS_PRESENT');
  }
}

function assertNoActiveContentDeclaration(text: string): void {
  if (
    /(?:ContentType|Type)\s*=\s*["'][^"']*(?:vbaProject|macroEnabled)[^"']*["']/iu.test(
      text,
    )
  ) {
    throw new SourceInspectionError(
      'FILE_XLSX_MACRO',
      '매크로 콘텐츠 유형 또는 관계가 있는 통합문서는 등록할 수 없습니다.',
    );
  }
  if (
    /(?:ContentType|Type)\s*=\s*["'][^"']*(?:activeX|oleObject|embeddedPackage|\/package)[^"']*["']/iu.test(
      text,
    )
  ) {
    throw new SourceInspectionError(
      'FILE_XLSX_ACTIVE_CONTENT',
      'ActiveX 또는 포함 개체 관계가 있는 통합문서는 등록할 수 없습니다.',
    );
  }
}

function assertXmlRoot(
  bytes: Uint8Array<ArrayBufferLike>,
  decoder: TextDecoder,
  rootName: string,
): void {
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    throw new SourceInspectionError(
      'FILE_XLSX_INVALID',
      '필수 XLSX XML 인코딩이 올바르지 않습니다.',
    );
  }
  if (validateXmlAndRoot(text) !== rootName) {
    throw new SourceInspectionError(
      'FILE_XLSX_INVALID',
      '필수 XLSX XML 구조가 올바르지 않습니다.',
    );
  }
}

function validateXmlAndRoot(text: string): string {
  const tokenPattern =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?([A-Za-z_][\w:.-]*)(?:\s[^<>]*?)?\/?>/gu;
  const stack: string[] = [];
  let root = '';
  let cursor = 0;
  for (const match of text.matchAll(tokenPattern)) {
    const raw = match[0];
    const between = text.slice(cursor, match.index);
    if (between.includes('<') || between.includes('>')) invalidXml();
    cursor = (match.index ?? 0) + raw.length;
    if (
      raw.startsWith('<?') ||
      raw.startsWith('<!--') ||
      raw.startsWith('<![')
    ) {
      continue;
    }
    const qualified = match[1];
    const local = qualified.split(':').at(-1) ?? qualified;
    if (raw.startsWith('</')) {
      if (stack.pop() !== qualified) invalidXml();
      continue;
    }
    if (!root) root = local;
    if (!raw.endsWith('/>')) stack.push(qualified);
  }
  const tail = text.slice(cursor);
  if (!root || stack.length > 0 || tail.includes('<') || tail.includes('>')) {
    invalidXml();
  }
  return root;
}

function invalidXml(): never {
  throw new SourceInspectionError(
    'FILE_XLSX_INVALID',
    'XLSX XML 문서 구조가 올바르지 않습니다.',
  );
}

function bytesEqual(
  left: Uint8Array<ArrayBuffer>,
  right: Uint8Array<ArrayBuffer>,
): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((value, index) => value === right[index]);
}

function crc32(bytes: Uint8Array<ArrayBufferLike>): number {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function snapshotBytes(
  body: ArrayBuffer | ArrayBufferView,
): Uint8Array<ArrayBuffer> {
  if (body instanceof ArrayBuffer) return new Uint8Array(body.slice(0));
  const snapshot = new Uint8Array(body.byteLength);
  snapshot.set(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  return snapshot;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}
