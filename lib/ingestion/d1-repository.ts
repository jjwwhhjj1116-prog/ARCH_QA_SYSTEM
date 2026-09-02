import { getD1Binding } from '@/db';
import type { Actor } from '@/lib/domain/contracts';
import { rolesForAction } from '@/lib/domain/permissions';
import { sourceObjectKey } from '@/lib/files/storage';
import type { SourceInspection } from '@/lib/imports/inspect-source-file';
import type {
  SourcePackageSummary,
  SourceUploadIntentSummary,
} from './contracts';
import { INGESTION_HARD_RULE_VERSION } from './contracts';
import type {
  NewSourcePackageRecord,
  SourcePackageRepository,
  SourceUploadRepository,
  StoredUploadSummary,
  UploadContext,
} from './repository';
import {
  SourcePackageAccessError,
  SourcePackageConflictError,
  SourceUploadStateError,
} from './repository';

type ExistingPackageRow = {
  id: string;
  project_id: string;
  review_case_id: string;
  display_name: string;
  request_hash: string;
  status: SourcePackageSummary['status'];
  project_identity_status: SourcePackageSummary['projectIdentityStatus'];
  created_at: number;
};

type ExistingFileRow = {
  upload_id: string;
  source_file_id: string;
  source_version_id: string;
  original_filename: string;
  extension_claimed: 'xlsx' | 'csv';
  declared_document_kind: 'takeoff' | 'summary' | 'unknown';
  status: SourceUploadIntentSummary['status'];
  upload_state: NonNullable<SourceUploadIntentSummary['uploadState']>;
  error_code: string | null;
  size_bytes: number;
};

type ListedPackageRow = Omit<ExistingPackageRow, 'request_hash'>;

type UploadRow = {
  upload_id: string;
  project_id: string;
  review_case_id: string;
  package_id: string;
  source_file_id: string;
  source_version_id: string;
  original_filename: string;
  content_type_claimed: string;
  extension_claimed: 'xlsx' | 'csv';
  expected_size: number;
  state: UploadContext['state'];
  version: number;
  updated_at: number;
  expires_at: number;
  r2_object_key: string;
};

type StoredUploadRow = {
  upload_id: string;
  package_id: string;
  source_version_id: string;
  original_filename: string;
  upload_state: UploadContext['state'];
  source_status: SourceUploadIntentSummary['status'];
  package_status: SourcePackageSummary['status'];
  project_identity_status: SourcePackageSummary['projectIdentityStatus'];
  sha256: string | null;
  size_bytes: number;
  validation_summary_json: string | null;
};

const uploadRoles = rolesForAction('source:upload');
const rolePlaceholders = uploadRoles.map(() => '?').join(',');
const UPLOAD_CLAIM_LEASE_MS = 5 * 60 * 1_000;

export class D1SourcePackageRepository
  implements SourcePackageRepository, SourceUploadRepository
{
  async listForActor(
    projectId: string,
    reviewCaseId: string,
    actorId: string,
  ): Promise<SourcePackageSummary[]> {
    const binding = getD1Binding();
    const [membershipRaw, packagesRaw, filesRaw] = await binding.batch([
      binding
        .prepare(
          `SELECT role
           FROM project_member
           WHERE project_id = ? AND user_id = ?
           LIMIT 1`,
        )
        .bind(projectId, actorId),
      binding
        .prepare(
          `SELECT sp.id, sp.project_id, sp.review_case_id, sp.display_name,
                  sp.status, sp.project_identity_status, sp.created_at
           FROM source_package sp
           INNER JOIN review_case rc ON rc.id = sp.review_case_id
           INNER JOIN project p ON p.id = sp.project_id
           INNER JOIN project_member pm ON pm.project_id = sp.project_id
           WHERE sp.project_id = ? AND sp.review_case_id = ?
             AND rc.project_id = sp.project_id AND pm.user_id = ?
             AND p.status = 'active' AND rc.status <> 'archived'
           ORDER BY sp.created_at DESC, sp.id DESC`,
        )
        .bind(projectId, reviewCaseId, actorId),
      binding
        .prepare(
          `SELECT sp.id AS package_id, ua.id AS upload_id,
                  sf.id AS source_file_id, sfv.id AS source_version_id,
                  sfv.original_filename, sfv.extension_claimed,
                  sf.declared_document_kind, sfv.status, sfv.size_bytes,
                  ua.state AS upload_state, ua.error_code
           FROM source_package sp
           INNER JOIN review_case rc ON rc.id = sp.review_case_id
           INNER JOIN project p ON p.id = sp.project_id
           INNER JOIN project_member pm ON pm.project_id = sp.project_id
           INNER JOIN source_file sf ON sf.package_id = sp.id
           INNER JOIN source_file_version sfv ON sfv.source_file_id = sf.id
           INNER JOIN upload_attempt ua ON ua.source_file_version_id = sfv.id
           WHERE sp.project_id = ? AND sp.review_case_id = ?
             AND rc.project_id = sp.project_id AND pm.user_id = ?
             AND p.status = 'active' AND rc.status <> 'archived'
             AND sfv.version_number = (
               SELECT MAX(latest_version.version_number)
               FROM source_file_version latest_version
               WHERE latest_version.source_file_id = sf.id
             )
             AND ua.id = (
               SELECT latest_attempt.id FROM upload_attempt latest_attempt
               WHERE latest_attempt.source_file_version_id = sfv.id
               ORDER BY latest_attempt.created_at DESC, latest_attempt.id DESC
               LIMIT 1
             )
           ORDER BY sp.created_at DESC, sp.id DESC, sf.display_name, sf.id`,
        )
        .bind(projectId, reviewCaseId, actorId),
    ]);
    const membership = membershipRaw as D1Result<{ role: string }>;
    if ((membership.results?.length ?? 0) === 0) {
      throw new SourcePackageAccessError(
        '이 프로젝트의 산출서와 집계표를 볼 권한이 없습니다.',
      );
    }
    const filesByPackage = new Map<string, SourceUploadIntentSummary[]>();
    for (const row of (
      filesRaw as D1Result<ExistingFileRow & { package_id: string }>
    ).results ?? []) {
      const files = filesByPackage.get(row.package_id) ?? [];
      files.push(fileSummary(row));
      filesByPackage.set(row.package_id, files);
    }
    return ((packagesRaw as D1Result<ListedPackageRow>).results ?? []).map(
      (row) => ({
        id: row.id,
        projectId: row.project_id,
        reviewCaseId: row.review_case_id,
        displayName: row.display_name,
        status: row.status,
        projectIdentityStatus: row.project_identity_status,
        files: filesByPackage.get(row.id) ?? [],
        createdAt: new Date(row.created_at).toISOString(),
      }),
    );
  }

  async create(record: NewSourcePackageRecord): Promise<SourcePackageSummary> {
    const existing = await this.loadExisting(record);
    if (existing) return existing;

    const binding = getD1Binding();
    const createdAt = record.createdAt.getTime();
    const statements: D1PreparedStatement[] = [
      binding
        .prepare(
          `INSERT INTO source_package
             (id, project_id, review_case_id, display_name, status, project_identity_status,
              hard_rule_version, idempotency_key, request_hash, version, created_by, created_at)
           SELECT ?, ?, ?, ?, 'receiving', 'pending', ?, ?, ?, 1, ?, ?
           FROM review_case rc
           INNER JOIN project p ON p.id = rc.project_id
           INNER JOIN project_member pm ON pm.project_id = rc.project_id
           WHERE rc.id = ? AND rc.project_id = ? AND rc.status <> 'archived'
             AND p.status = 'active' AND pm.user_id = ?
             AND pm.role IN (${rolePlaceholders})`,
        )
        .bind(
          record.id,
          record.projectId,
          record.reviewCaseId,
          record.displayName,
          record.hardRuleVersion,
          record.idempotencyKey,
          record.requestHash,
          record.actor.id,
          createdAt,
          record.reviewCaseId,
          record.projectId,
          record.actor.id,
          ...uploadRoles,
        ),
    ];

    for (const file of record.files) {
      statements.push(
        binding
          .prepare(
            `INSERT INTO source_file
               (id, package_id, project_id, review_case_id, purpose,
                declared_document_kind, display_name, status, created_by, created_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?
             FROM source_package sp
             WHERE sp.id = ? AND sp.project_id = ? AND sp.created_by = ?`,
          )
          .bind(
            file.sourceFileId,
            record.id,
            record.projectId,
            record.reviewCaseId,
            file.purpose,
            file.documentKind,
            file.filename,
            record.actor.id,
            createdAt,
            record.id,
            record.projectId,
            record.actor.id,
          ),
        binding
          .prepare(
            `INSERT INTO source_file_version
               (id, source_file_id, package_id, project_id, review_case_id, version_number,
                original_filename, extension_claimed, content_type_claimed, size_bytes,
                r2_object_key, status, project_identity_status, created_by, created_at)
             SELECT ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'upload_pending', 'pending', ?, ?
             FROM source_file sf
             WHERE sf.id = ? AND sf.package_id = ? AND sf.project_id = ?`,
          )
          .bind(
            file.sourceVersionId,
            file.sourceFileId,
            record.id,
            record.projectId,
            record.reviewCaseId,
            file.filename,
            file.format,
            file.contentType,
            file.sizeBytes,
            file.r2ObjectKey,
            record.actor.id,
            createdAt,
            file.sourceFileId,
            record.id,
            record.projectId,
          ),
        binding
          .prepare(
            `INSERT INTO upload_attempt
               (id, project_id, review_case_id, package_id, source_file_version_id,
                created_by, state, idempotency_key, r2_object_key, expected_size,
                error_code, correlation_id, version, created_at, updated_at, expires_at)
             SELECT ?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, NULL, ?, 1, ?, ?, ?
             FROM source_file_version sfv
             WHERE sfv.id = ? AND sfv.package_id = ? AND sfv.project_id = ?`,
          )
          .bind(
            file.uploadId,
            record.projectId,
            record.reviewCaseId,
            record.id,
            file.sourceVersionId,
            record.actor.id,
            file.uploadId,
            file.r2ObjectKey,
            file.sizeBytes,
            record.requestId,
            createdAt,
            createdAt,
            record.expiresAt.getTime(),
            file.sourceVersionId,
            record.id,
            record.projectId,
          ),
      );
    }

    statements.push(
      binding
        .prepare(
          `INSERT INTO audit_event
             (id, project_id, actor_id, action, target_type, target_id,
              payload_json, request_id, created_at)
           SELECT ?, ?, ?, 'source_package.created', 'source_package', ?, ?, ?, ?
           FROM source_package sp
           WHERE sp.id = ? AND sp.project_id = ? AND sp.created_by = ?`,
        )
        .bind(
          crypto.randomUUID(),
          record.projectId,
          record.actor.id,
          record.id,
          JSON.stringify({
            fileCount: record.files.length,
            requestHash: record.requestHash,
            hardRuleVersion: record.hardRuleVersion,
          }),
          record.requestId,
          createdAt,
          record.id,
          record.projectId,
          record.actor.id,
        ),
    );

    try {
      const results = await binding.batch(statements);
      if (results.some((result) => result.meta.changes !== 1)) {
        throw new SourcePackageAccessError(
          '이 프로젝트와 검수 케이스에 파일을 등록할 권한이 없습니다.',
        );
      }
      return summaryFromRecord(record);
    } catch (error) {
      const raced = await this.loadExisting(record);
      if (raced) return raced;
      throw error;
    }
  }

  async claim(
    uploadId: string,
    actor: Actor,
    requestId: string,
  ): Promise<UploadContext> {
    const binding = getD1Binding();
    const raw = await binding
      .prepare(
        `SELECT ua.id AS upload_id, ua.project_id, ua.review_case_id,
                ua.package_id, sf.id AS source_file_id,
                sfv.id AS source_version_id, sfv.original_filename,
                sfv.content_type_claimed, sfv.extension_claimed,
                ua.expected_size, ua.state, ua.version, ua.updated_at,
                ua.expires_at,
                ua.r2_object_key
         FROM upload_attempt ua
         INNER JOIN source_file_version sfv ON sfv.id = ua.source_file_version_id
         INNER JOIN source_file sf ON sf.id = sfv.source_file_id
         INNER JOIN source_package sp ON sp.id = ua.package_id
         INNER JOIN review_case rc ON rc.id = ua.review_case_id
         INNER JOIN project p ON p.id = ua.project_id
         INNER JOIN project_member pm ON pm.project_id = ua.project_id
         WHERE ua.id = ? AND pm.user_id = ?
           AND pm.role IN (${rolePlaceholders})
           AND p.status = 'active' AND rc.status <> 'archived'
           AND sp.status NOT IN ('blocked','rejected','aborted')
           AND sfv.package_id = ua.package_id
           AND sfv.project_id = ua.project_id
           AND sfv.review_case_id = ua.review_case_id
         LIMIT 1`,
      )
      .bind(uploadId, actor.id, ...uploadRoles)
      .first<UploadRow>();
    if (!raw) {
      throw new SourcePackageAccessError(
        '이 파일 업로드에 접근할 권한이 없습니다.',
      );
    }
    const context = uploadContext(raw);
    if (context.r2ObjectKey !== sourceObjectKey(locatorFrom(context))) {
      throw new SourceUploadStateError(
        '업로드 파일의 저장 계보가 올바르지 않습니다.',
      );
    }
    if (raw.state === 'finalized') return context;
    if (raw.expires_at <= Date.now()) {
      await binding
        .prepare(
          `UPDATE upload_attempt
           SET state = 'expired', error_code = 'UPLOAD_EXPIRED',
               version = version + 1, updated_at = ?
           WHERE id = ? AND version = ? AND state <> 'finalized'`,
        )
        .bind(Date.now(), uploadId, raw.version)
        .run();
      throw new SourceUploadStateError('업로드 유효시간이 만료되었습니다.');
    }
    const now = Date.now();
    const staleClaim =
      raw.state === 'uploading' &&
      raw.updated_at <= now - UPLOAD_CLAIM_LEASE_MS;
    if (raw.state !== 'created' && raw.state !== 'failed' && !staleClaim) {
      throw new SourceUploadStateError(
        '이 파일은 이미 업로드 처리 중이거나 종료되었습니다.',
      );
    }
    const claimed = await binding
      .prepare(
        `UPDATE upload_attempt
         SET state = 'uploading', error_code = NULL, correlation_id = ?,
             version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?
           AND (state IN ('created','failed')
             OR (state = 'uploading' AND updated_at <= ?))`,
      )
      .bind(requestId, now, uploadId, raw.version, now - UPLOAD_CLAIM_LEASE_MS)
      .run();
    if (claimed.meta.changes !== 1) {
      throw new SourceUploadStateError(
        '동시에 시작된 다른 업로드 요청이 있습니다.',
      );
    }
    return {
      ...context,
      state: 'uploading',
      claimVersion: raw.version + 1,
    };
  }

  async complete(
    context: UploadContext,
    actor: Actor,
    requestId: string,
    inspection: SourceInspection,
  ): Promise<StoredUploadSummary> {
    const existing = await this.loadStoredUpload(context, inspection);
    if (existing) return existing;

    const binding = getD1Binding();
    const now = Date.now();
    const importJobId = crypto.randomUUID();
    const validationSummary = JSON.stringify({
      version: 'source-preflight-2026.09.01',
      format: inspection.format,
      documentKind: inspection.documentKind,
      archiveEntryCount: inspection.archiveEntryCount,
      archiveUncompressedBytes: inspection.archiveUncompressedBytes,
      csvRowCount: inspection.csvRowCount,
      warnings: inspection.warnings,
    });
    const statements = [
      binding
        .prepare(
          `UPDATE source_file_version
           SET extension_detected = ?, content_type_detected = ?, sha256 = ?,
               status = 'stored', validation_summary_json = ?, stored_at = ?
           WHERE id = ? AND source_file_id = ? AND package_id = ?
             AND project_id = ? AND review_case_id = ?
             AND status = 'upload_pending'
             AND EXISTS (
               SELECT 1 FROM upload_attempt claimed
               WHERE claimed.id = ? AND claimed.source_file_version_id = source_file_version.id
                 AND claimed.state = 'uploading' AND claimed.correlation_id = ?
                 AND claimed.version = ?
             )`,
        )
        .bind(
          inspection.format,
          inspection.detectedContentType,
          inspection.sha256,
          validationSummary,
          now,
          context.sourceVersionId,
          context.sourceFileId,
          context.packageId,
          context.projectId,
          context.reviewCaseId,
          context.uploadId,
          requestId,
          context.claimVersion,
        ),
      binding
        .prepare(
          `INSERT INTO import_job
             (id, project_id, review_case_id, package_id, source_file_version_id,
              parser_name, parser_version, hard_rule_version, state, stage,
              progress_current, progress_total, work_lease_token, lease_expires_at,
              version, error_code, correlation_id, created_at, started_at,
              completed_at, failed_at)
           SELECT ?, ?, ?, ?, ?, 'pending-parser', 'unselected', ?, 'queued',
                  'awaiting_parser_contract', 0, 1, NULL, NULL, 1, NULL, ?, ?,
                  NULL, NULL, NULL
           FROM upload_attempt claimed
           INNER JOIN source_file_version sfv
             ON sfv.id = claimed.source_file_version_id
           WHERE claimed.id = ? AND claimed.state = 'uploading'
             AND claimed.correlation_id = ? AND claimed.version = ?
             AND sfv.status = 'stored'`,
        )
        .bind(
          importJobId,
          context.projectId,
          context.reviewCaseId,
          context.packageId,
          context.sourceVersionId,
          INGESTION_HARD_RULE_VERSION,
          requestId,
          now,
          context.uploadId,
          requestId,
          context.claimVersion,
        ),
      binding
        .prepare(
          `UPDATE source_package
           SET status = CASE
             WHEN NOT EXISTS (
               SELECT 1 FROM source_file_version pending
               WHERE pending.package_id = source_package.id
                 AND pending.status <> 'stored'
             ) THEN 'stored_unverified'
             ELSE 'receiving'
           END,
           version = version + 1
           WHERE id = ? AND project_id = ? AND review_case_id = ?
             AND status IN ('receiving','validating','stored_unverified')
             AND EXISTS (
               SELECT 1 FROM upload_attempt claimed
               INNER JOIN source_file_version sfv
                 ON sfv.id = claimed.source_file_version_id
               WHERE claimed.id = ? AND claimed.state = 'uploading'
                 AND claimed.correlation_id = ? AND claimed.version = ?
                 AND sfv.status = 'stored'
             )`,
        )
        .bind(
          context.packageId,
          context.projectId,
          context.reviewCaseId,
          context.uploadId,
          requestId,
          context.claimVersion,
        ),
      binding
        .prepare(
          `INSERT INTO audit_event
             (id, project_id, actor_id, action, target_type, target_id,
              payload_json, request_id, created_at)
           SELECT ?, ?, ?, 'source_file.stored', 'source_file_version', ?, ?, ?, ?
           FROM upload_attempt claimed
           INNER JOIN source_file_version sfv
             ON sfv.id = claimed.source_file_version_id
           WHERE claimed.id = ? AND claimed.state = 'uploading'
             AND claimed.correlation_id = ? AND claimed.version = ?
             AND sfv.status = 'stored'`,
        )
        .bind(
          crypto.randomUUID(),
          context.projectId,
          actor.id,
          context.sourceVersionId,
          JSON.stringify({
            packageId: context.packageId,
            sha256: inspection.sha256,
            sizeBytes: inspection.sizeBytes,
            warningCount: inspection.warnings.length,
          }),
          requestId,
          now,
          context.uploadId,
          requestId,
          context.claimVersion,
        ),
      binding
        .prepare(
          `UPDATE upload_attempt
           SET state = 'finalized', error_code = NULL,
               version = version + 1, updated_at = ?
           WHERE id = ? AND project_id = ? AND source_file_version_id = ?
             AND state = 'uploading' AND correlation_id = ? AND version = ?`,
        )
        .bind(
          now,
          context.uploadId,
          context.projectId,
          context.sourceVersionId,
          requestId,
          context.claimVersion,
        ),
    ];
    try {
      const results = await binding.batch(statements);
      if (results.some((result) => result.meta.changes !== 1)) {
        throw new SourceUploadStateError(
          '업로드 완료 상태를 원자적으로 기록하지 못했습니다.',
        );
      }
    } catch (error) {
      const raced = await this.loadStoredUpload(context, inspection);
      if (raced) return raced;
      throw error;
    }
    const stored = await this.loadStoredUpload(context, inspection);
    if (!stored) {
      throw new SourceUploadStateError(
        '업로드 완료 기록을 다시 확인할 수 없습니다.',
      );
    }
    return stored;
  }

  async fail(
    context: UploadContext,
    actor: Actor,
    requestId: string,
    errorCode: string,
  ): Promise<void> {
    const binding = getD1Binding();
    const result = await binding
      .prepare(
        `UPDATE upload_attempt
         SET state = 'failed', error_code = ?,
             version = version + 1, updated_at = ?
         WHERE id = ? AND project_id = ? AND review_case_id = ?
           AND source_file_version_id = ? AND state = 'uploading'
           AND correlation_id = ? AND version = ?
           AND EXISTS (
             SELECT 1 FROM project_member pm
             WHERE pm.project_id = upload_attempt.project_id AND pm.user_id = ?
               AND pm.role IN (${rolePlaceholders})
           )`,
      )
      .bind(
        errorCode,
        Date.now(),
        context.uploadId,
        context.projectId,
        context.reviewCaseId,
        context.sourceVersionId,
        requestId,
        context.claimVersion,
        actor.id,
        ...uploadRoles,
      )
      .run();
    if (result.meta.changes !== 1) {
      throw new SourceUploadStateError(
        '업로드 실패 상태를 원자적으로 기록하지 못했습니다.',
      );
    }
  }

  private async loadStoredUpload(
    context: UploadContext,
    inspection: SourceInspection,
  ): Promise<StoredUploadSummary | null> {
    const row = await getD1Binding()
      .prepare(
        `SELECT ua.id AS upload_id, ua.package_id, sfv.id AS source_version_id,
                sfv.original_filename, ua.state AS upload_state,
                sfv.status AS source_status, sp.status AS package_status,
                sfv.project_identity_status, sfv.sha256, sfv.size_bytes,
                sfv.validation_summary_json
         FROM upload_attempt ua
         INNER JOIN source_file_version sfv ON sfv.id = ua.source_file_version_id
         INNER JOIN source_package sp ON sp.id = ua.package_id
         WHERE ua.id = ? AND ua.project_id = ? AND ua.review_case_id = ?
           AND ua.package_id = ? AND sfv.id = ?`,
      )
      .bind(
        context.uploadId,
        context.projectId,
        context.reviewCaseId,
        context.packageId,
        context.sourceVersionId,
      )
      .first<StoredUploadRow>();
    if (
      !row ||
      row.upload_state !== 'finalized' ||
      row.source_status !== 'stored'
    ) {
      return null;
    }
    if (
      row.sha256 !== inspection.sha256 ||
      row.size_bytes !== inspection.sizeBytes
    ) {
      throw new SourceUploadStateError(
        '기존 업로드와 다시 전송한 파일의 무결성이 일치하지 않습니다.',
      );
    }
    const validation = parseValidationSummary(row.validation_summary_json);
    return {
      uploadId: row.upload_id,
      packageId: row.package_id,
      sourceVersionId: row.source_version_id,
      filename: row.original_filename,
      status: 'stored',
      packageStatus: row.package_status,
      projectIdentityStatus: row.project_identity_status,
      sha256: row.sha256,
      sizeBytes: row.size_bytes,
      warnings: validation.warnings,
    };
  }

  private async loadExisting(
    record: NewSourcePackageRecord,
  ): Promise<SourcePackageSummary | null> {
    const binding = getD1Binding();
    const [packageRaw, filesRaw] = await binding.batch([
      binding
        .prepare(
          `SELECT sp.id, sp.project_id, sp.review_case_id, sp.display_name,
                  sp.request_hash, sp.status, sp.project_identity_status, sp.created_at
           FROM source_package sp
           INNER JOIN review_case rc ON rc.id = sp.review_case_id
           INNER JOIN project p ON p.id = sp.project_id
           INNER JOIN project_member pm ON pm.project_id = sp.project_id
           WHERE sp.project_id = ? AND sp.review_case_id = ?
             AND sp.created_by = ? AND sp.idempotency_key = ?
             AND p.status = 'active' AND rc.status <> 'archived' AND pm.user_id = ?
             AND pm.role IN (${rolePlaceholders})
           LIMIT 1`,
        )
        .bind(
          record.projectId,
          record.reviewCaseId,
          record.actor.id,
          record.idempotencyKey,
          record.actor.id,
          ...uploadRoles,
        ),
      binding
        .prepare(
          `SELECT ua.id AS upload_id, sf.id AS source_file_id,
                  sfv.id AS source_version_id, sfv.original_filename,
                  sfv.extension_claimed, sf.declared_document_kind, sfv.status,
                  sfv.size_bytes, ua.state AS upload_state, ua.error_code
           FROM source_package sp
           INNER JOIN review_case rc ON rc.id = sp.review_case_id
           INNER JOIN source_file sf ON sf.package_id = sp.id
           INNER JOIN source_file_version sfv ON sfv.source_file_id = sf.id
           INNER JOIN upload_attempt ua ON ua.source_file_version_id = sfv.id
           WHERE sp.project_id = ? AND sp.review_case_id = ?
             AND sp.created_by = ? AND sp.idempotency_key = ?
             AND rc.status <> 'archived'
             AND sfv.version_number = (
               SELECT MAX(latest_version.version_number)
               FROM source_file_version latest_version
               WHERE latest_version.source_file_id = sf.id
             )
             AND ua.id = (
               SELECT latest_attempt.id FROM upload_attempt latest_attempt
               WHERE latest_attempt.source_file_version_id = sfv.id
               ORDER BY latest_attempt.created_at DESC, latest_attempt.id DESC
               LIMIT 1
             )
           ORDER BY sf.display_name, sf.id`,
        )
        .bind(
          record.projectId,
          record.reviewCaseId,
          record.actor.id,
          record.idempotencyKey,
        ),
    ]);
    const packageRow = (packageRaw as D1Result<ExistingPackageRow>)
      .results?.[0];
    if (!packageRow) return null;
    if (packageRow.request_hash !== record.requestHash) {
      throw new SourcePackageConflictError(
        '같은 멱등키에 다른 파일 묶음을 사용할 수 없습니다.',
      );
    }
    const files = (filesRaw as D1Result<ExistingFileRow>).results ?? [];
    return {
      id: packageRow.id,
      projectId: packageRow.project_id,
      reviewCaseId: packageRow.review_case_id,
      displayName: packageRow.display_name,
      status: packageRow.status,
      projectIdentityStatus: packageRow.project_identity_status,
      files: files.map(fileSummary),
      createdAt: new Date(packageRow.created_at).toISOString(),
    };
  }
}

function uploadContext(row: UploadRow): UploadContext {
  return {
    uploadId: row.upload_id,
    projectId: row.project_id,
    reviewCaseId: row.review_case_id,
    packageId: row.package_id,
    sourceFileId: row.source_file_id,
    sourceVersionId: row.source_version_id,
    filename: row.original_filename,
    contentType: row.content_type_claimed,
    format: row.extension_claimed,
    expectedSize: row.expected_size,
    claimVersion: row.version,
    state: row.state,
    r2ObjectKey: row.r2_object_key,
  };
}

function locatorFrom(context: UploadContext) {
  return {
    projectId: context.projectId,
    caseId: context.reviewCaseId,
    sourceVersionId: context.sourceVersionId,
    fileId: context.sourceFileId,
    extension: context.format,
  } as const;
}

function parseValidationSummary(value: string | null): { warnings: string[] } {
  if (!value) return { warnings: [] };
  try {
    const parsed = JSON.parse(value) as { warnings?: unknown };
    return {
      warnings: Array.isArray(parsed.warnings)
        ? parsed.warnings.filter(
            (warning): warning is string => typeof warning === 'string',
          )
        : [],
    };
  } catch {
    throw new SourceUploadStateError(
      '저장된 파일 검사 근거를 다시 읽을 수 없습니다.',
    );
  }
}

function summaryFromRecord(
  record: NewSourcePackageRecord,
): SourcePackageSummary {
  return {
    id: record.id,
    projectId: record.projectId,
    reviewCaseId: record.reviewCaseId,
    displayName: record.displayName,
    status: 'receiving',
    projectIdentityStatus: 'pending',
    files: record.files.map((file) => ({
      uploadId: file.uploadId,
      sourceFileId: file.sourceFileId,
      sourceVersionId: file.sourceVersionId,
      filename: file.filename,
      format: file.format,
      documentKind: file.documentKind,
      sizeBytes: file.sizeBytes,
      status: file.status,
      uploadState: 'created',
      errorCode: null,
    })),
    createdAt: record.createdAt.toISOString(),
  };
}

function fileSummary(row: ExistingFileRow): SourceUploadIntentSummary {
  return {
    uploadId: row.upload_id,
    sourceFileId: row.source_file_id,
    sourceVersionId: row.source_version_id,
    filename: row.original_filename,
    format: row.extension_claimed,
    documentKind: row.declared_document_kind,
    sizeBytes: row.size_bytes,
    status: row.status,
    uploadState: row.upload_state,
    errorCode: row.error_code,
  };
}
