import { open } from 'node:fs/promises';

// Exclusive creation also rejects existing originals, aliases and symlinks.
export async function saveNewReport(path, bytes) {
  let handle;
  try {
    handle = await open(path, 'wx');
    await handle.writeFile(bytes);
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        '기존 파일은 덮어쓰지 않습니다. 분석표를 새 이름으로 저장해 주세요.',
      );
    throw new Error(
      '분석표 저장에 실패했습니다. 저장 위치와 여유 공간을 확인해 주세요.',
    );
  } finally {
    await handle?.close();
  }
}
