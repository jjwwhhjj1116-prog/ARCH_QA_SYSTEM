import { describe, expect, it } from 'vitest';
import type { SourcePackageSummary } from './contracts';
import {
  checklistAvailability,
  hasUsableStoredSources,
  matchDocument,
} from './document-checklist';

const partial: SourcePackageSummary = {
  id: 'package',
  version: 1,
  projectId: 'project',
  reviewCaseId: 'case',
  displayName: '테스트',
  status: 'receiving',
  projectIdentityStatus: 'pending',
  createdAt: '2026-09-03T00:00:00Z',
  files: [
    {
      uploadId: 'u1',
      sourceFileId: 'f1',
      sourceVersionId: 'v1',
      filename: '내부산출서.xlsx',
      format: 'xlsx',
      documentKind: 'takeoff',
      sizeBytes: 10,
      status: 'stored',
    },
    {
      uploadId: 'u2',
      sourceFileId: 'f2',
      sourceVersionId: 'v2',
      filename: '동별집계표.xlsx',
      format: 'xlsx',
      documentKind: 'summary',
      sizeBytes: 10,
      status: 'rejected',
      uploadState: 'failed',
    },
  ],
};

describe('document availability is guidance, not a full-package gate', () => {
  it('excludes pending replacements and superseded sources from current input', () => {
    const replaces = [{ id: 'old', version: 1 }];
    expect(hasUsableStoredSources({ ...partial, replaces })).toBe(false);
    expect(hasUsableStoredSources({ ...partial, supersededBy: 'new' })).toBe(
      false,
    );
    expect(
      hasUsableStoredSources({
        ...partial,
        replaces,
        replacementAppliedAt: '2026-09-03T00:00:00Z',
      }),
    ).toBe(true);
  });
  it('lets stored files proceed without promoting a partially received package', () => {
    expect(hasUsableStoredSources(partial)).toBe(true);
    expect(partial.status).toBe('receiving');
    expect(
      hasUsableStoredSources({ ...partial, files: [partial.files[1]] }),
    ).toBe(false);
  });
  it.each(['blocked', 'rejected', 'aborted'] as const)(
    'keeps %s packages blocked',
    (status) => {
      expect(hasUsableStoredSources({ ...partial, status })).toBe(false);
    },
  );
  it('does not bypass a project identity conflict', () => {
    expect(
      hasUsableStoredSources({ ...partial, projectIdentityStatus: 'conflict' }),
    ).toBe(false);
  });
  it('distinguishes selected, stored, missing and unclassified source files', () => {
    const rows = checklistAvailability(
      'FIN',
      [{ name: '외부산출서.xlsx' }],
      [partial],
    );
    expect(rows.find((row) => row.id === 'takeoff-내부')?.stored).toBe(1);
    expect(rows.find((row) => row.id === 'takeoff-외부')?.selected).toBe(1);
    expect(rows.find((row) => row.id === 'building')?.stored).toBe(0);
    expect(matchDocument('이름을알수없는자료.xlsx', 'FIN')).toBeNull();
  });
  it('matches FIN summaries separately from takeoffs and normalizes names', () => {
    expect(matchDocument('01_내부 산출서(일반).XLSX', 'FIN')).toBe(
      'takeoff-내부',
    );
    expect(matchDocument('산출근거집계표.xlsx', 'FIN')).toBe('basis');
    expect(matchDocument('공종별 집계표.csv', 'FIN')).toBe('trade');
    expect(matchDocument('부위별집계표(F).xlsx', 'FIN')).toBe('part');
    expect(matchDocument('아파트슬라브산출서.xlsx', 'RC')).toBe(
      'takeoff-아파트슬라브',
    );
    expect(matchDocument('내부산출서.xlsx', 'RC')).toBeNull();
  });
});
