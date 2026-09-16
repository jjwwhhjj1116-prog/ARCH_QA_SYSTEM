/** Company credentials stay on the server; each media response is bounded. */
export async function downloadOriginal(
  id: string,
  size: number,
  progress: (bytes: number) => void,
  fetcher: typeof fetch = fetch,
  expectedSha256?: string,
) {
  if (!id || !Number.isSafeInteger(size) || size <= 0 || size > 200 * 1048576)
    throw new Error('파일 크기를 확인해 주세요.');
  if (expectedSha256 !== undefined && !/^[a-f0-9]{64}$/.test(expectedSha256))
    throw new Error('원본 해시를 확인해 주세요.');
  const parts: ArrayBuffer[] = [];
  let expectedHash = expectedSha256 ?? '';
  for (let start = 0; start < size; start += 1048576) {
    const end = Math.min(start + 1048576, size) - 1;
    const response = await fetcher(
      `/api/uploads/${encodeURIComponent(id)}/original`,
      {
        headers: { range: `bytes=${start}-${end}` },
        signal: AbortSignal.timeout(60000),
      },
    );
    const hash = response.headers.get('x-original-sha256') ?? '';
    if (
      response.status !== 206 ||
      response.headers.get('content-range') !==
        `bytes ${start}-${end}/${size}` ||
      !/^[a-f0-9]{64}$/.test(hash) ||
      (expectedHash && expectedHash !== hash)
    ) {
      await response.body?.cancel();
      throw new Error(
        '원본 다운로드를 확인하지 못했습니다. 다시 시도해 주세요.',
      );
    }
    expectedHash = hash;
    const reader = response.body?.getReader();
    if (!reader) throw new Error('다운로드 응답이 비어 있습니다.');
    const chunk = new Uint8Array(end - start + 1);
    let offset = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        if (offset + part.value.length > chunk.length)
          throw new Error('다운로드 크기가 다릅니다.');
        chunk.set(part.value, offset);
        offset += part.value.length;
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    if (offset !== chunk.length)
      throw new Error('다운로드가 중단되었습니다. 다시 시도해 주세요.');
    parts.push(chunk.buffer);
    progress(end + 1);
  }
  const blob = new Blob(parts, { type: 'application/octet-stream' });
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  if (digest !== expectedHash)
    throw new Error(
      '원본 무결성 확인에 실패했습니다. 파일을 저장하지 않았습니다.',
    );
  return blob;
}
