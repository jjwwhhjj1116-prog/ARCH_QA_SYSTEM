import { Unzip, UnzipInflate, unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';

export class WorkbookError extends Error {
  readonly code = 'SOURCE_NEEDS_MAPPING';
}
export const MAX_REVIEW_XML = 64 * 1024 * 1024;
const MAX_FRAGMENT = 512 * 1024;

// Only requested entries are inflated. Small compressed chunks bound each inflate
// allocation even when a workbook contains very repetitive formatting XML.
export function streamXml(
  bytes: Uint8Array,
  select: (
    name: string,
  ) => ((text: string, final: boolean) => void) | undefined,
) {
  // Validate the central directory even though content is subsequently streamed.
  try {
    unzipSync(bytes, { filter: () => false });
  } catch {
    throw new WorkbookError('ZIP 디렉터리가 없거나 손상되었습니다.');
  }
  let expanded = 0;
  let entries = 0;
  const seen = new Set<string>();
  const zip = new Unzip((file) => {
    if (++entries > 4096 || seen.has(file.name))
      throw new WorkbookError(
        '중복 ZIP 항목 또는 파일 수 한도를 확인해 주세요.',
      );
    seen.add(file.name);
    const consume = select(file.name);
    if (!consume) return;
    if ((file.originalSize ?? 0) > MAX_REVIEW_XML)
      throw new WorkbookError(
        '검수 XML이 안전 한도 64MB를 넘었습니다. 원본은 보존됩니다.',
      );
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let tail = '';
    file.ondata = (error, chunk, final) => {
      if (error)
        throw error instanceof WorkbookError
          ? error
          : new WorkbookError('압축된 시트 내용을 읽지 못했습니다.');
      expanded += chunk.byteLength;
      if (expanded > MAX_REVIEW_XML)
        throw new WorkbookError(
          '검수 XML이 안전 한도 64MB를 넘었습니다. 원본은 보존됩니다.',
        );
      const text = decoder.decode(chunk, { stream: !final });
      const checked = tail + text;
      if (/<!DOCTYPE|<!ENTITY/iu.test(checked))
        throw new WorkbookError('외부 정의가 포함된 XML은 읽지 않습니다.');
      tail = checked.slice(-16);
      consume(text, final);
    };
    file.start();
  });
  zip.register(UnzipInflate);
  for (let offset = 0; offset < bytes.length; offset += 1024)
    zip.push(
      bytes.subarray(offset, offset + 1024),
      offset + 1024 >= bytes.length,
    );
}

// A SAX parser validates complete XML while retaining only the selected row/si.
// Parent paths prevent extension XML, comments and processing instructions from
// masquerading as actual worksheet rows. Re-encoding only feeds the existing
// cell parser; source bytes/hash are unchanged.
export function xmlFragments(
  tag: 'row' | 'si',
  consume: (xml: string) => void,
) {
  const parser = new SaxesParser({ xmlns: false });
  const path: string[] = [];
  const parent = tag === 'row' ? 'worksheet/sheetData' : 'sst';
  let fragment = '';
  let captureDepth = 0;
  let progress = 0;
  const escape = (text: string) =>
    text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  const add = (text: string) => {
    fragment += text;
    if (fragment.length > MAX_FRAGMENT)
      throw new WorkbookError(
        '한 행 또는 공유 문자열의 XML이 안전 한도를 넘었습니다.',
      );
  };
  const tick = () => {
    progress = parser.position;
  };
  parser.on('error', () => {
    throw new WorkbookError(
      '시트 XML이 올바르게 닫히지 않았거나 손상되었습니다.',
    );
  });
  parser.on('doctype', () => {
    throw new WorkbookError('외부 정의가 포함된 XML은 읽지 않습니다.');
  });
  parser.on('opentag', (node) => {
    tick();
    if (node.name === tag && path.join('/') === parent)
      captureDepth = path.length + 1;
    path.push(node.name);
    if (path.length > 32)
      throw new WorkbookError('XML 중첩 한도를 넘었습니다.');
    if (captureDepth)
      add(
        `<${node.name}${Object.entries(node.attributes)
          .map(([k, v]) => ` ${k}="${escape(v)}"`)
          .join('')}>`,
      );
  });
  parser.on('closetag', (node) => {
    tick();
    if (captureDepth) {
      add(`</${node.name}>`);
      if (path.length === captureDepth) {
        consume(fragment);
        fragment = '';
        captureDepth = 0;
      }
    }
    path.pop();
  });
  const textContent = (text: string) => {
    tick();
    if (captureDepth) add(escape(text));
  };
  parser.on('text', textContent);
  parser.on('cdata', textContent);
  parser.on('comment', tick);
  parser.on('processinginstruction', tick);
  return (text: string, final: boolean) => {
    for (let offset = 0; offset < text.length; offset += 4096) {
      parser.write(text.slice(offset, offset + 4096));
      if (parser.position - progress > MAX_FRAGMENT)
        throw new WorkbookError('XML 토큰의 안전 한도를 넘었습니다.');
    }
    if (final) parser.close();
  };
}
