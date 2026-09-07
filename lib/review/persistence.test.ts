// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
function database() {
  const db = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle')
    .filter((n) => n.endsWith('.sql'))
    .sort())
    db.exec(readFileSync('drizzle/' + name, 'utf8'));
  db.exec(
    "INSERT INTO user_profile VALUES ('u','synthetic@example.invalid','Synthetic',0); INSERT INTO project VALUES ('p','P','합성 시험',NULL,'active','u',0); INSERT INTO project_member VALUES ('m','p','u','project_owner',0); INSERT INTO review_case VALUES ('c','p','마감팀','FIN','draft','u',NULL,NULL,0);",
  );
  return db;
}
describe('review SQLite guards', () => {
  it('keeps profile history immutable and rechecks live membership', () => {
    const db = database();
    try {
      db.exec(
        "INSERT INTO qc_profile_version VALUES ('v','p',1,'{}','u','2026-09-07');",
      );
      expect(() =>
        db.exec("UPDATE qc_profile_version SET profile_json='{}' WHERE id='v'"),
      ).toThrow('immutable');
      expect(() =>
        db.exec("DELETE FROM qc_profile_version WHERE id='v'"),
      ).toThrow('immutable');
      db.exec("UPDATE project_member SET role='viewer' WHERE id='m'");
      expect(() =>
        db.exec(
          "INSERT INTO qc_profile_version VALUES ('v2','p',2,'{}','u','2026-09-07')",
        ),
      ).toThrow('QC_PERMISSION_CHANGED');
    } finally {
      db.close();
    }
  });
  it('prevents stale mapping snapshots and retains the prior mapping', () => {
    const db = database();
    try {
      db.exec(
        "INSERT INTO qc_mapping_version VALUES ('map1','p','c','[]','u','now','initial')",
      );
      expect(() =>
        db.exec(
          "INSERT INTO qc_mapping_version VALUES ('map2','p','c','[]','u','now','initial')",
        ),
      ).toThrow('MAPPING_CONFLICT');
      db.exec(
        "INSERT INTO qc_mapping_version VALUES ('map2','p','c','[]','u','now','map1')",
      );
      expect(
        db.prepare('SELECT COUNT(*) AS n FROM qc_mapping_version').get()?.n,
      ).toBe(2);
    } finally {
      db.close();
    }
  });
  it('requires trial approval for formal runs and disallows decisions on trials', () => {
    const db = database();
    try {
      db.exec(
        "INSERT INTO qc_profile_version VALUES ('v','p',1,'{}','u','now')",
      );
      expect(() =>
        db.exec(
          "INSERT INTO qc_review_run VALUES ('r','p','c','v',1,0,'key','hash',1,1,'u','now')",
        ),
      ).toThrow('PROFILE_NOT_APPROVED');
      db.exec(
        "INSERT INTO qc_review_run VALUES ('trial','p','c','v',1,1,'trialkey','hash',1,1,'u','now')",
      );
      expect(() =>
        db.exec(
          "INSERT INTO qc_review_decision VALUES ('d','p','trial','f','normal','reason','u','now')",
        ),
      ).toThrow('QC_PERMISSION_CHANGED');
      db.exec(
        "INSERT INTO qc_profile_approval VALUES ('a','p','v','trial','u','now'); INSERT INTO qc_review_run VALUES ('r','p','c','v',1,0,'key','hash',1,1,'u','now'); INSERT INTO qc_review_decision VALUES ('d','p','r','f','hold','확인 필요','u','now');",
      );
      expect(() =>
        db.exec("DELETE FROM qc_review_decision WHERE id='d'"),
      ).toThrow('immutable');
    } finally {
      db.close();
    }
  });
});
