import { env } from 'cloudflare:workers';
import type { PrivateFileStorage } from './storage';
import { PrivateR2FileStorage } from './r2-storage';

export function getPrivateFileStorage(): PrivateFileStorage {
  if (!env.FILES) {
    throw new FileStorageUnavailableError(
      '원본 파일 저장소가 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  return new PrivateR2FileStorage(env.FILES);
}

export class FileStorageUnavailableError extends Error {
  readonly code = 'FILE_STORAGE_UNAVAILABLE';
}
