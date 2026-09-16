// @vitest-environment node
import { expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { defaultProfile, type Run } from './contracts';
import { exportReview } from './report';

it('exports all 200,000 missing pairs and 20,000 source index rows', () => {
  const rows = Array.from({ length: 20000 }, (_, i) => ({
    id: `row-${i}`,
    ref: {
      filename: '합성.csv',
      sourceVersionId: 'synthetic',
      sha256: 'synthetic',
      sheet: '자료',
      row: i + 2,
      cell: `A${i + 2}`,
    },
    fieldRefs: {},
    excluded: null,
  }));
  const run = {
    id: 'synthetic',
    projectId: 'p',
    caseId: 'c',
    actorId: 'a',
    createdAt: '2026-09-15T00:00:00Z',
    profileId: 'v',
    profileVersion: 1,
    trial: true,
    engineVersion: 'test',
    profile: {
      ...defaultProfile,
      instructions: Array.from({ length: 10 }, (_, i) => ({
        id: `i${i}`,
        text: '합성지침',
        enabled: true,
      })),
    },
    rows,
    sources: [],
    mappings: [],
    findings: [],
    coverage: [],
    limitations: [],
  } as unknown as Run;
  const before = process.memoryUsage().rss;
  const start = performance.now();
  const output = exportReview(run, []);
  const elapsedMs = Math.round(performance.now() - start);
  const rssAfter = process.memoryUsage().rss;
  const files = unzipSync(output);
  const ledger = strFromU8(files['xl/worksheets/sheet2.xml']);
  const index = strFromU8(files['xl/worksheets/sheet4.xml']);
  expect(ledger.match(/>missing<\/t>/g)).toHaveLength(200000);
  expect(index.match(/<row r=/g)).toHaveLength(20001);
  expect(ledger).toContain('row-19999');
  process.stdout.write(
    JSON.stringify({
      kind: 'local-node-not-worker-report',
      elapsedMs,
      zipBytes: output.length,
      expandedBytes: Object.values(files).reduce((n, b) => n + b.length, 0),
      rssBefore: before,
      rssAfter,
      maxRssKiB: process.resourceUsage().maxRSS,
    }) + '\n',
  );
}, 30000);
