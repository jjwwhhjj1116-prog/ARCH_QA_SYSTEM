import { RequestBoundaryError } from '@/lib/http/request-boundary';
import type { Run } from './contracts';

export type RecoveryRecord = {
  actorId: string;
  projectId: string;
  caseId: string;
  requestKey: string;
  runId: string;
  fingerprint: string;
  state: 'claimed' | 'ready' | 'completed';
  chunks?: number;
  sha256?: string;
  size?: number;
};
const CHUNK = 128 * 1024;
const key = (actorId: string, caseId: string, requestKey: string) =>
  `ai-meta/${encodeURIComponent(actorId)}/${caseId}/${requestKey}`;
const bodyKey = (record: RecoveryRecord, index: number) =>
  `ai-body/${record.runId}/${index}`;
const hash = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
function denied(code: string, message: string): never {
  throw new RequestBoundaryError(409, code, message);
}
// One project DO owns this bounded journal. No timers erase an uncertain paid request.
export class AiRecoveryStore {
  constructor(private storage: DurableObjectStorage) {}
  get(actorId: string, caseId: string, requestKey: string) {
    return this.storage.get<RecoveryRecord>(key(actorId, caseId, requestKey));
  }
  async pending(actorId: string, caseId: string) {
    const records = await this.storage.list<RecoveryRecord>({
      prefix: `ai-meta/${encodeURIComponent(actorId)}/${caseId}/`,
      limit: 1001,
    });
    return [...records.values()]
      .filter((r) => r.state !== 'completed')
      .map((r) => ({
        requestKey: r.requestKey,
        runId: r.runId,
        state: r.state as 'claimed' | 'ready',
      }));
  }
  async claim(record: RecoveryRecord) {
    await this.storage.transaction(async (tx) => {
      if (await tx.get(key(record.actorId, record.caseId, record.requestKey)))
        denied(
          'AI_REQUEST_ALREADY_STARTED',
          '이미 접수된 AI 요청입니다. 저장 복구 또는 실행 이력을 확인하세요.',
        );
      const all = await tx.list<RecoveryRecord>({
        prefix: 'ai-meta/',
        limit: 1001,
      });
      if (
        all.size >= 1000 ||
        [...all.values()].filter((r) => r.state !== 'completed').length >= 4
      )
        denied(
          'AI_RECOVERY_CAPACITY',
          'AI 복구 저장 한도입니다. 미완료 요청을 먼저 확인해 주세요. 새 AI 호출은 하지 않았습니다.',
        );
      await tx.put(
        key(record.actorId, record.caseId, record.requestKey),
        record,
      );
    });
  }
  async checkpoint(record: RecoveryRecord, run: Run) {
    const bytes = new TextEncoder().encode(JSON.stringify(run));
    if (bytes.byteLength > 24 * 1024 * 1024)
      denied(
        'REVIEW_EVIDENCE_LIMIT',
        'AI 결과 보관 한도를 넘었습니다. 자동 재호출하지 않습니다.',
      );
    const sha256 = await hash(bytes);
    const chunks = Math.ceil(bytes.byteLength / CHUNK);
    await this.storage.transaction(async (tx) => {
      const current = await tx.get<RecoveryRecord>(
        key(record.actorId, record.caseId, record.requestKey),
      );
      if (current?.state !== 'claimed' || current.runId !== run.id)
        denied('AI_RECOVERY_CONFLICT', 'AI 복구 상태가 변경되었습니다.');
      for (let i = 0; i < chunks; i++)
        await tx.put(
          bodyKey(record, i),
          bytes.slice(i * CHUNK, (i + 1) * CHUNK),
        );
      await tx.put(key(record.actorId, record.caseId, record.requestKey), {
        ...record,
        state: 'ready',
        chunks,
        sha256,
        size: bytes.byteLength,
      });
    });
  }
  async read(record: RecoveryRecord): Promise<Run> {
    if (
      record.state !== 'ready' ||
      !record.chunks ||
      !record.size ||
      !Number.isInteger(record.size) ||
      record.size < 1 ||
      record.size > 24 * 1024 * 1024 ||
      record.chunks !== Math.ceil(record.size / CHUNK)
    )
      denied(
        'AI_RESULT_UNCERTAIN',
        'AI 응답을 안전하게 보관했는지 확인할 수 없습니다. 자동 재호출하지 않습니다.',
      );
    const bytes = new Uint8Array(record.size);
    let offset = 0;
    for (let i = 0; i < record.chunks; i++) {
      const chunk = await this.storage.get<Uint8Array>(bodyKey(record, i));
      if (
        !chunk ||
        chunk.byteLength > CHUNK ||
        offset + chunk.byteLength > bytes.byteLength
      )
        denied('AI_RECOVERY_INTEGRITY', 'AI 복구 데이터가 일치하지 않습니다.');
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (offset !== record.size || (await hash(bytes)) !== record.sha256)
      denied('AI_RECOVERY_INTEGRITY', 'AI 복구 해시가 일치하지 않습니다.');
    const run = JSON.parse(new TextDecoder().decode(bytes)) as Run;
    if (
      run.id !== record.runId ||
      run.actorId !== record.actorId ||
      run.projectId !== record.projectId ||
      run.caseId !== record.caseId
    )
      denied('AI_RECOVERY_INTEGRITY', 'AI 복구 범위가 일치하지 않습니다.');
    return run;
  }
  async complete(record: RecoveryRecord) {
    await this.storage.transaction(async (tx) => {
      const current = await tx.get<RecoveryRecord>(
        key(record.actorId, record.caseId, record.requestKey),
      );
      if (!current || current.runId !== record.runId)
        denied('AI_RECOVERY_CONFLICT', 'AI 복구 상태가 변경되었습니다.');
      for (let i = 0; i < (current.chunks ?? 0); i++)
        await tx.delete(bodyKey(record, i));
      await tx.put(key(record.actorId, record.caseId, record.requestKey), {
        ...current,
        state: 'completed',
        chunks: 0,
      });
    });
  }
}
