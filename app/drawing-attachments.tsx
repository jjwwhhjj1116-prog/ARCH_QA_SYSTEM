'use client';

import { OriginalDownload } from './original-download';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  uploadResumable,
  ResumableUploadError,
} from '@/lib/http/resumable-upload';
import { readUploadResponse } from '@/lib/http/upload-response';

const attachmentSchema = z.object({
  uploadId: z.string().min(1),
  filename: z.string(),
  sizeBytes: z.number().int().positive(),
  status: z.enum(['upload_pending', 'uploaded']),
});
type Attachment = z.infer<typeof attachmentSchema>;
type Selected = {
  file: File;
  key: string;
  uploadId?: string;
  progress: number;
  state: 'waiting' | 'uploading' | 'uploaded' | 'failed';
  error?: string;
};
const maximumBytes = 200 * 1024 * 1024;
const mimeTypes: Record<string, string> = {
  pdf: 'application/pdf',
  dwg: 'image/vnd.dwg',
  dxf: 'image/vnd.dxf',
};

/** Reset scope on navigation: a retained File must never upload into another project. */
export function DrawingAttachments(props: {
  projectId: string;
  caseId: string;
}) {
  return (
    <DrawingAttachmentScope
      key={`${props.projectId}/${props.caseId}`}
      {...props}
    />
  );
}

function DrawingAttachmentScope({
  projectId,
  caseId,
}: {
  projectId: string;
  caseId: string;
}) {
  const url = `/api/projects/${encodeURIComponent(projectId)}/cases/${encodeURIComponent(caseId)}/attachments`;
  const [stored, setStored] = useState<Attachment[]>([]);
  const [selected, setSelected] = useState<Selected[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const active = useRef(true);
  const running = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(url, { credentials: 'same-origin' });
      const envelope = await readUploadResponse(response);
      if ('error' in envelope) throw new Error(envelope.error.message);
      const parsed = attachmentSchema.array().safeParse(envelope.data);
      if (!response.ok || !parsed.success)
        throw new Error(
          '도면 목록 응답을 확인하지 못했습니다. 새로 확인해 주세요.',
        );
      if (active.current) setStored(parsed.data);
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : '도면 목록을 불러오지 못했습니다. 새로 확인해 주세요.',
        );
    } finally {
      if (active.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    active.current = true;
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      active.current = false;
      window.clearTimeout(timer);
    };
  }, [load]);

  function select(files: File[]) {
    setSelectionError('');
    if (files.length > 32) {
      setSelectionError(
        '한 번에 32개까지 선택할 수 있습니다. 기존 선택은 유지됩니다.',
      );
      return;
    }
    if (
      files.some(
        (file) =>
          !/\.(pdf|dwg|dxf)$/iu.test(file.name) ||
          file.size <= 0 ||
          file.size > maximumBytes,
      )
    ) {
      setSelectionError(
        'PDF·DWG·DXF 파일만 선택하세요. 파일당 200MiB 이하이며 빈 파일은 저장할 수 없습니다. 기존 선택은 유지됩니다.',
      );
      return;
    }
    setSelected((previous) => [
      ...previous,
      ...files
        .filter(
          (file) =>
            !previous.some(
              (item) =>
                item.file.name === file.name &&
                item.file.size === file.size &&
                item.file.lastModified === file.lastModified,
            ),
        )
        .map(
          (file): Selected => ({
            file,
            key: crypto.randomUUID(),
            progress: 0,
            state: 'waiting',
          }),
        ),
    ]);
  }
  function update(key: string, patch: Partial<Selected>) {
    if (active.current)
      setSelected((items) =>
        items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
      );
  }
  async function save() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      for (const item of selected.filter(
        (entry) => entry.state !== 'uploaded',
      )) {
        if (!active.current) break;
        update(item.key, { state: 'uploading', error: undefined });
        try {
          let uploadId = item.uploadId;
          if (!uploadId) {
            const extension = item.file.name.split('.').pop()!.toLowerCase();
            const response = await fetch(url, {
              method: 'POST',
              credentials: 'same-origin',
              headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': item.key,
              },
              body: JSON.stringify({
                filename: item.file.name,
                contentType: mimeTypes[extension],
                sizeBytes: item.file.size,
              }),
            });
            const envelope = await readUploadResponse(response);
            if ('error' in envelope) throw new Error(envelope.error.message);
            const parsed = attachmentSchema.safeParse(envelope.data);
            if (
              !response.ok ||
              !parsed.success ||
              parsed.data.sizeBytes !== item.file.size
            )
              throw new Error(
                '도면 등록 응답을 확인하지 못했습니다. 다시 저장해 주세요.',
              );
            uploadId = parsed.data.uploadId;
            update(item.key, { uploadId });
          }
          if (!active.current) break;
          await uploadResumable(uploadId, item.file, (ack, total) =>
            update(item.key, { progress: Math.floor((ack * 100) / total) }),
          );
          update(item.key, { state: 'uploaded', progress: 100 });
          const uploaded: Attachment = {
            uploadId,
            filename: item.file.name,
            sizeBytes: item.file.size,
            status: 'uploaded',
          };
          if (active.current)
            setStored((items) => [
              ...items.filter((entry) => entry.uploadId !== uploadId),
              uploaded,
            ]);
        } catch (cause) {
          update(item.key, {
            state: 'failed',
            error:
              cause instanceof ResumableUploadError || cause instanceof Error
                ? cause.message
                : '전송하지 못했습니다. 실패한 파일만 다시 저장하세요.',
          });
        }
      }
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  }
  const pending = selected.filter((item) => item.state !== 'uploaded');
  return (
    <section className="settings-card" aria-label="도면 원본 첨부">
      <h2>도면 원본 첨부</h2>
      <p>도면 원본 보관 전용 · 자동 검수에는 포함되지 않습니다.</p>
      <p>
        PDF·DWG·DXF · 파일당 최대 200MiB · 한 번에 32개. 전송 중에는 이 화면을
        유지해 주세요.
      </p>
      <label>
        도면 파일 선택
        <input
          type="file"
          accept=".pdf,.dwg,.dxf"
          multiple
          disabled={busy}
          onChange={(event) => {
            select(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </label>
      {selectionError && (
        <p role="alert" className="personal-settings-error">
          {selectionError}
        </p>
      )}
      <div className="personal-settings-actions">
        <button
          type="button"
          className="primary-action"
          disabled={busy || loading || pending.length === 0}
          onClick={() => void save()}
        >
          {busy
            ? '도면 저장 중…'
            : pending.some((item) => item.state === 'failed')
              ? '실패·대기 파일 이어서 저장'
              : '선택 도면 저장'}
        </button>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => {
            setLoading(true);
            setError('');
            void load();
          }}
        >
          저장 목록 새로 확인
        </button>
      </div>
      {selected.length > 0 && (
        <ul aria-label="선택 도면 전송 상태">
          {selected.map((item) => (
            <li key={item.key} style={{ overflowWrap: 'anywhere' }}>
              <strong>{item.file.name}</strong> ·{' '}
              {item.state === 'uploaded'
                ? '저장 완료'
                : item.state === 'failed'
                  ? '저장 확인 실패'
                  : item.state === 'uploading'
                    ? `서버 확인 ${item.progress}%`
                    : '저장 대기'}
              {item.state === 'uploading' && (
                <progress
                  aria-label={`${item.file.name} 전송률`}
                  max={100}
                  value={item.progress}
                />
              )}
              {item.error && (
                <p className="personal-settings-error">{item.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <output>
        {busy
          ? '서버에서 확인한 전송량을 표시합니다. 완료한 파일은 다시 전송하지 않습니다.'
          : loading
            ? '저장 목록 확인 중…'
            : error
              ? '저장 목록 확인이 필요합니다. 기존 파일은 유지됩니다.'
              : `저장 완료 도면 ${stored.filter((item) => item.status === 'uploaded').length}개`}
      </output>
      {error && (
        <p role="alert" className="personal-settings-error">
          {error}
        </p>
      )}
      {!loading && !error && stored.length === 0 && (
        <p>저장된 도면이 없습니다. 위에서 도면을 선택하고 저장하세요.</p>
      )}
      {stored.length > 0 && (
        <ul aria-label="저장된 도면">
          {stored.map((item) => (
            <li key={item.uploadId} style={{ overflowWrap: 'anywhere' }}>
              {item.filename} · {(item.sizeBytes / 1024 / 1024).toFixed(1)}MiB ·{' '}
              {item.status === 'uploaded' ? (
                <OriginalDownload
                  uploadId={item.uploadId}
                  filename={item.filename}
                  sizeBytes={item.sizeBytes}
                />
              ) : (
                '저장 미완료'
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
