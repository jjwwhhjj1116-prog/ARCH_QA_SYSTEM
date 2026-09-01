import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    exclude: ['tests/e2e/**', 'node_modules/**'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Unit coverage protects deterministic/auth/service boundaries. The D1
      // adapter and React workflow are exercised against a real local D1 by
      // Playwright, so mixing those layers into this metric would count the
      // same paths without providing a meaningful unit-level signal.
      include: [
        'lib/auth/**/*.ts',
        'lib/domain/**/*.ts',
        'lib/cases/repository.ts',
        'lib/cases/service.ts',
        'lib/files/r2-storage.ts',
        'lib/files/storage.ts',
        'lib/http/**/*.ts',
        'lib/imports/**/*.ts',
        'lib/ingestion/contracts.ts',
        'lib/ingestion/repository.ts',
        'lib/ingestion/service.ts',
        'lib/ingestion/upload-service.ts',
        'lib/projects/service.ts',
        'lib/projects/memory-repository.ts',
      ],
      thresholds: { lines: 70, functions: 70, statements: 70, branches: 60 },
    },
  },
});
