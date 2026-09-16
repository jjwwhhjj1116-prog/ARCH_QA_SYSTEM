'use client';
import { useState } from 'react';
import { downloadOriginal } from '@/lib/http/download-original';
export function OriginalDownload({
  uploadId,
  filename,
  sizeBytes,
}: {
  uploadId: string;
  filename: string;
  sizeBytes: number;
}) {
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState('');
  async function download() {
    if (busy) return;
    setBusy(true);
    setError('');
    setPercent(0);
    try {
      const blob = await downloadOriginal(uploadId, sizeBytes, (n) =>
        setPercent(Math.floor((n * 100) / sizeBytes)),
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : '다운로드에 실패했습니다. 다시 시도해 주세요.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <span>
      <button
        type="button"
        className="button button-secondary"
        onClick={() => void download()}
        disabled={busy}
        aria-label={`${filename} 원본 다운로드`}
      >
        {busy ? `다운로드 ${percent}%` : '원본 다운로드'}
      </button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}
