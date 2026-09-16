import { env } from 'cloudflare:workers';
import { getD1Binding } from '@/db';
import { DriveStorage } from './drive-storage';

export function reviewStorage() {
  if (process.env.FILE_STORAGE_PROVIDER === 'google-drive') {
    const storage = new DriveStorage(
      getD1Binding(),
      process.env.AI_SETTINGS_ENCRYPTION_KEY,
    );
    return {
      get: (key: string) => storage.get(key),
      put: (
        key: string,
        body: string | Uint8Array<ArrayBuffer>,
        options: {
          httpMetadata: { contentType: string };
          customMetadata?: Record<string, string>;
        },
      ) =>
        storage.put(
          key,
          typeof body === 'string' ? new TextEncoder().encode(body) : body,
          options.httpMetadata.contentType,
        ),
    };
  }
  if (!env.FILES) throw new Error('검수 근거 저장소가 연결되지 않았습니다.');
  return env.FILES;
}
