import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: [
    './db/schema.ts',
    './db/review-schema.ts',
    './db/employee-schema.ts',
    './db/baseline-schema.ts',
    './db/drive-schema.ts',
  ],
  dialect: 'sqlite',
});
