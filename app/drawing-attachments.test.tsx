import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DrawingAttachments } from './drawing-attachments';
import { uploadResumable } from '@/lib/http/resumable-upload';

vi.mock('@/lib/http/resumable-upload', async (original) => ({
  ...(await original<typeof import('@/lib/http/resumable-upload')>()),
  uploadResumable: vi.fn(),
}));
const attachment = (
  uploadId: string,
  filename: string,
  status: 'uploaded' | 'upload_pending' = 'uploaded',
) => ({ uploadId, filename, sizeBytes: 3, status });
function setup(items: ReturnType<typeof attachment>[] = []) {
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}');
      return Response.json({
        data: { ...body, uploadId: body.filename, status: 'upload_pending' },
        requestId: 'test',
      });
    }
    return Response.json({ data: items, requestId: 'test' });
  });
  vi.stubGlobal('fetch', fetcher);
  render(<DrawingAttachments projectId="project" caseId="case" />);
  return fetcher;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('lists originals but never presents attachments as AI-reviewed', async () => {
  setup([
    attachment('one', 'floor.pdf'),
    attachment('two', 'section.dwg', 'upload_pending'),
  ]);
  expect(
    await screen.findByRole('button', { name: 'floor.pdf 원본 다운로드' }),
  ).toBeEnabled();
  expect(screen.getAllByRole('button', { name: /원본 다운로드/ })).toHaveLength(
    1,
  );
  expect(
    screen.getByText('도면 원본 보관 전용 · 자동 검수에는 포함되지 않습니다.'),
  ).toBeInTheDocument();
  expect(screen.getByText(/section.dwg.*저장 미완료/)).toBeInTheDocument();
});

it('rejects over-limit selections without clearing an earlier valid File', async () => {
  setup();
  await screen.findByText(
    '저장된 도면이 없습니다. 위에서 도면을 선택하고 저장하세요.',
  );
  const input = screen.getByLabelText('도면 파일 선택');
  const valid = new File(['pdf'], 'floor.pdf');
  fireEvent.change(input, { target: { files: [valid] } });
  const large = new File(['pdf'], 'large.pdf');
  Object.defineProperty(large, 'size', { value: 200 * 1024 * 1024 + 1 });
  fireEvent.change(input, { target: { files: [large] } });
  expect(screen.getByRole('alert')).toHaveTextContent('200MiB');
  expect(screen.getByText('floor.pdf')).toBeInTheDocument();
  fireEvent.change(input, {
    target: { files: Array.from({ length: 33 }, () => valid) },
  });
  expect(screen.getByRole('alert')).toHaveTextContent('32개');
  expect(screen.getByRole('button', { name: '선택 도면 저장' })).toBeEnabled();
});

it('keeps successful files and retries only failures with their same upload id', async () => {
  const fetcher = setup();
  await screen.findByText(
    '저장된 도면이 없습니다. 위에서 도면을 선택하고 저장하세요.',
  );
  vi.mocked(uploadResumable)
    .mockImplementationOnce(async (_id, file, progress) => {
      progress(file.size, file.size);
      return {
        uploadId: 'floor.pdf',
        offset: 3,
        sizeBytes: 3,
        chunkBytes: 1048576,
        status: 'uploaded',
      };
    })
    .mockRejectedValueOnce(new Error('전송 연결 끊김'))
    .mockResolvedValueOnce({
      uploadId: 'section.dwg',
      offset: 3,
      sizeBytes: 3,
      chunkBytes: 1048576,
      status: 'uploaded',
    });
  fireEvent.change(screen.getByLabelText('도면 파일 선택'), {
    target: {
      files: [new File(['pdf'], 'floor.pdf'), new File(['dwg'], 'section.dwg')],
    },
  });
  fireEvent.click(screen.getByRole('button', { name: '선택 도면 저장' }));
  await screen.findByText('전송 연결 끊김');
  expect(screen.getAllByRole('button', { name: /원본 다운로드/ })).toHaveLength(
    1,
  );
  fireEvent.click(
    screen.getByRole('button', { name: '실패·대기 파일 이어서 저장' }),
  );
  await waitFor(() =>
    expect(
      screen.getAllByRole('button', { name: /원본 다운로드/ }),
    ).toHaveLength(2),
  );
  expect(vi.mocked(uploadResumable).mock.calls.map((call) => call[0])).toEqual([
    'floor.pdf',
    'section.dwg',
    'section.dwg',
  ]);
  expect(
    fetcher.mock.calls.filter((call) => call[1]?.method === 'POST'),
  ).toHaveLength(2);
});

it('shows acknowledged progress without claiming success until transfer resolves', async () => {
  setup();
  await screen.findByText(
    '저장된 도면이 없습니다. 위에서 도면을 선택하고 저장하세요.',
  );
  let complete: (() => void) | undefined;
  vi.mocked(uploadResumable).mockImplementation(
    async (_id, _file, progress) => {
      progress(1, 3);
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
      return {
        uploadId: 'floor.pdf',
        offset: 3,
        sizeBytes: 3,
        chunkBytes: 1048576,
        status: 'uploaded',
      };
    },
  );
  fireEvent.change(screen.getByLabelText('도면 파일 선택'), {
    target: { files: [new File(['pdf'], 'floor.pdf')] },
  });
  fireEvent.click(screen.getByRole('button', { name: '선택 도면 저장' }));
  expect(await screen.findByRole('progressbar')).toHaveAttribute('value', '33');
  expect(
    screen.queryByRole('button', { name: /원본 다운로드/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('도면 파일 선택')).toBeDisabled();
  complete!();
  await screen.findByRole('button', { name: /원본 다운로드/ });
});

it('keeps the idempotency key after a lost creation response', async () => {
  const fetcher = setup();
  await screen.findByText(
    '저장된 도면이 없습니다. 위에서 도면을 선택하고 저장하세요.',
  );
  fetcher.mockRejectedValueOnce(new Error('연결 실패'));
  vi.mocked(uploadResumable).mockResolvedValue({
    uploadId: 'floor.pdf',
    offset: 3,
    sizeBytes: 3,
    chunkBytes: 1048576,
    status: 'uploaded',
  });
  fireEvent.change(screen.getByLabelText('도면 파일 선택'), {
    target: { files: [new File(['pdf'], 'floor.pdf')] },
  });
  fireEvent.click(screen.getByRole('button', { name: '선택 도면 저장' }));
  await screen.findByText('연결 실패');
  fireEvent.click(
    screen.getByRole('button', { name: '실패·대기 파일 이어서 저장' }),
  );
  await screen.findByRole('button', { name: /원본 다운로드/ });
  const creates = fetcher.mock.calls.filter(
    (call) => call[1]?.method === 'POST',
  );
  expect(creates[0]![1]!.headers).toEqual(creates[1]![1]!.headers);
});
