import { env } from 'cloudflare:workers';
import type { PrivateFileStorage } from './storage';
import { PrivateR2FileStorage } from './r2-storage';

export function getPrivateFileStorage(): PrivateFileStorage {
  if (!env.FILES) {
    throw new Error('Cloudflare R2 binding `FILES` is unavailable.');
  }
  return new PrivateR2FileStorage(env.FILES);
}
