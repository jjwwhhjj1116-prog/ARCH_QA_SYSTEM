import { parentPort, workerData } from 'node:worker_threads';
import { readFile, lstat } from 'node:fs/promises';
import { inspectAndReview, inspectSources } from './core';
try {
  const files = [];
  for (const item of workerData.files) {
    if (item.provenance) {
      if (
        !(item.bytes instanceof Uint8Array) ||
        item.bytes.byteLength !== item.size ||
        item.size > 20 * 1048576
      )
        throw new Error('등록 원본의 크기를 다시 확인해 주세요.');
      files.push({
        filename: item.filename,
        bytes: item.bytes,
        provenance: item.provenance,
      });
      continue;
    }
    const stat = await lstat(item.path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size !== item.size ||
      stat.size > 20 * 1048576
    )
      throw new Error(
        '파일이 변경됐거나 크기 한도를 넘었습니다. 다시 선택해 주세요.',
      );
    const bytes = await readFile(item.path);
    files.push({ filename: item.filename, bytes: new Uint8Array(bytes) });
    parentPort.postMessage({
      type: 'progress',
      message: `원본 읽기 ${files.length}/${workerData.files.length}`,
    });
  }
  parentPort.postMessage({
    type: 'progress',
    message: '원본 안전 검사·일반 기준 검수 중',
  });
  const result =
    workerData.mode === 'inspect'
      ? await inspectSources(files)
      : await inspectAndReview(files, workerData.context, workerData.overrides);
  parentPort.postMessage({ type: 'result', result });
} catch (e) {
  parentPort.postMessage({
    type: 'error',
    message: e instanceof Error ? e.message : '로컬 검사에 실패했습니다.',
  });
}
