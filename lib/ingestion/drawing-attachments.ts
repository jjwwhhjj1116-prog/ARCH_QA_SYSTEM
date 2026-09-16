import { z } from 'zod';
import type { Actor } from '@/lib/domain/contracts';
import { rolesForAction } from '@/lib/domain/permissions';
import { canonicalSourceFilename } from '@/lib/imports/source-filename';
import { DriveError } from '@/lib/files/google-drive';
import { idempotencyKeySchema } from './contracts';
import { SourcePackageAccessError } from './repository';

const inputSchema = z
  .object({
    filename: z.string().min(1).max(180),
    contentType: z.string().max(120),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(200 * 1024 * 1024),
  })
  .strict();
type Attachment = {
  id: string;
  filename: string;
  size_bytes: number;
  status: 'upload_pending' | 'uploaded';
};
const summarize = (row: Attachment) => ({
  uploadId: row.id,
  filename: row.filename,
  sizeBytes: row.size_bytes,
  status: row.status,
});
const scopeSql = `SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id
  JOIN review_case rc ON rc.project_id=p.id WHERE p.id=? AND rc.id=? AND pm.user_id=?
  AND p.status='active' AND rc.status<>'archived'`;
export function drawingAttachments(
  db: D1Database,
  projectId: string,
  caseId: string,
  actor: Actor,
) {
  const values = [projectId, caseId, actor.id];
  const writeRoles = rolesForAction('source:upload');
  const writeSql = `${scopeSql} AND pm.role IN (${writeRoles.map(() => '?').join(',')})`;
  return {
    async list() {
      if (
        !(await db
          .prepare(scopeSql)
          .bind(...values)
          .first())
      )
        throw new SourcePackageAccessError('프로젝트 접근 권한이 없습니다.');
      const rows = await db
        .prepare(
          'SELECT id,filename,size_bytes,status FROM qc_drawing_attachment WHERE project_id=? AND review_case_id=? ORDER BY created_at DESC LIMIT 200',
        )
        .bind(projectId, caseId)
        .all<Attachment>();
      return rows.results.map(summarize);
    },
    async create(input: unknown, key: string, requestId: string) {
      if (
        !(await db
          .prepare(writeSql)
          .bind(...values, ...writeRoles)
          .first())
      )
        throw new SourcePackageAccessError(
          '이 프로젝트에 도면을 첨부할 권한이 없습니다.',
        );
      const parsed = inputSchema.parse(input);
      const filename = canonicalSourceFilename(parsed.filename);
      const extension = filename.split('.').at(-1)?.toLowerCase();
      if (!extension || !['pdf', 'dwg', 'dxf'].includes(extension))
        throw new DriveError(
          'FILE_EXTENSION_UNSUPPORTED',
          '도면 첨부는 PDF, DWG, DXF를 지원합니다.',
          400,
        );
      idempotencyKeySchema.parse(key);
      const id = crypto.randomUUID();
      const now = Date.now();
      await db.batch([
        db
          .prepare(`INSERT OR IGNORE INTO qc_drawing_attachment(id,project_id,review_case_id,filename,extension,size_bytes,created_by,created_at,expires_at,idempotency_key)
          SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(${writeSql}) AND (SELECT COUNT(*) FROM qc_drawing_attachment WHERE project_id=? AND review_case_id=?)<200`)
          .bind(
            id,
            projectId,
            caseId,
            filename,
            extension,
            parsed.sizeBytes,
            actor.id,
            now,
            now + 86_400_000,
            key,
            ...values,
            ...writeRoles,
            projectId,
            caseId,
          ),
        db
          .prepare(`INSERT INTO audit_event(id,project_id,actor_id,action,target_type,target_id,payload_json,request_id,created_at)
          SELECT ?,?,?,'drawing.intent_created','drawing_attachment',?,'{}',?,? WHERE EXISTS(SELECT 1 FROM qc_drawing_attachment WHERE id=?)`)
          .bind(
            crypto.randomUUID(),
            projectId,
            actor.id,
            id,
            requestId,
            now,
            id,
          ),
      ]);
      const row = await db
        .prepare(
          'SELECT id,filename,size_bytes,status FROM qc_drawing_attachment WHERE project_id=? AND review_case_id=? AND created_by=? AND idempotency_key=?',
        )
        .bind(...values, key)
        .first<Attachment>();
      if (!row)
        throw new DriveError(
          'ATTACHMENT_LIMIT',
          '등록 권한 또는 첨부 개수 한도(검토 건당 200개)를 확인해 주세요.',
          409,
        );
      if (row.filename !== filename || row.size_bytes !== parsed.sizeBytes)
        throw new DriveError(
          'IDEMPOTENCY_CONFLICT',
          '같은 등록 요청의 파일 정보가 변경되었습니다.',
          409,
        );
      return summarize(row);
    },
  };
}
