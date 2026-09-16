# CSV Drive hotfix and production cycle

- User authorized immediate repair/deployment of the discovered upload failure on 2026-09-09.
- Scope FILE-001, FILE-005, FILE-009: DriveStorage normalizes the inspector's UTF-8 MIME parameter to a bare Drive media type; source bytes and SHA256 remain unchanged. Unexpected parameters and header injection remain rejected.
- Upload UUID validation is isolated; internal validation no longer masquerades as an invalid upload ID. Safe typed Drive errors retain their code/status/guidance.
- Fixed three existing Testing Library role queries to use exact-name regex instead of unsupported `exact` options; assertion meaning preserved.
- Focused storage/API tests: 37 passed. Full suite: 51 files, 381 tests passed. Direct Cloudflare build passed.
- No migration, account, key, permission, retention or audience changes. Preserve previous Worker version `6e84c62b-31c5-4928-8b73-10755236e669` as rollback; existing Google Drive connections remain intact.
- Production cycle pending revalidation; unit tests are not evidence of a completed real Gemini/report cycle.
