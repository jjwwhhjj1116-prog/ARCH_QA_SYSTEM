import { SourceInspectionError } from '@/lib/imports/inspect-source-file';

// Registration guard only. Does not claim XML/archive/CSV validation.
export function checkTransferSignature(
  format: 'xlsx' | 'csv' | 'pdf' | 'dwg' | 'dxf',
  bytes: Uint8Array,
) {
  if (format === 'pdf' || format === 'dwg' || format === 'dxf') {
    const header = new TextDecoder('ascii').decode(bytes.subarray(0, 1024));
    const valid =
      format === 'pdf'
        ? header.startsWith('%PDF-')
        : format === 'dwg'
          ? /^AC10\d{2}/u.test(header)
          : header.startsWith('AutoCAD Binary DXF\r\n\x1a\0') ||
            /^\s*0\s*\r?\nSECTION\s*\r?\n/u.test(header);
    if (!valid)
      throw new SourceInspectionError(
        'FILE_SIGNATURE_MISMATCH',
        '도면 확장자와 파일 내용이 다릅니다.',
      );
    return;
  }
  const zip =
    bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
  if (format === 'xlsx' ? !zip : zip || bytes.subarray(0, 4096).includes(0)) {
    throw new SourceInspectionError(
      'FILE_SIGNATURE_MISMATCH',
      '파일 확장자와 내용이 다릅니다. 원본 파일을 확인해 주세요.',
    );
  }
}
