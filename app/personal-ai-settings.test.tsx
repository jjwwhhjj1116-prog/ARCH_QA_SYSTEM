import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { it, expect, vi, afterEach } from 'vitest';
import { PersonalAiSettings } from './personal-ai-settings';
const initial = {
  configured: false,
  storageReady: true,
  model: null,
  version: 0,
  checkedAt: null,
  availableModels: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('saves through the real form, clears input, preserves key on error, and confirms disconnect', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ data: initial }))
    .mockResolvedValueOnce(
      Response.json({
        data: {
          ...initial,
          configured: true,
          model: 'gemini-3.8-flash',
          version: 1,
        },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ error: { message: '인증 실패' } }, { status: 502 }),
    )
    .mockResolvedValueOnce(Response.json({ data: { ...initial, version: 2 } }));
  vi.stubGlobal('fetch', fetcher);
  render(<PersonalAiSettings isAdmin={false} />);
  const save = await screen.findByRole('button', { name: '연결 확인 후 저장' });
  await waitFor(() => expect(save).toBeEnabled());
  expect(screen.getByLabelText('사용할 모델')).toHaveValue('gemini-3.8-flash');
  const input = screen.getByLabelText('Gemini API 키');
  fireEvent.change(input, { target: { value: 'synthetic-ui-key-not-real' } });
  fireEvent.click(save);
  await screen.findByText(/연결 확인 및 저장 완료/);
  expect(JSON.parse(fetcher.mock.calls[1][1].body).model).toBe(
    'gemini-3.8-flash',
  );
  expect(input).toHaveValue('');
  fireEvent.change(input, { target: { value: 'replacement-ui-key-not-real' } });
  fireEvent.click(save);
  await screen.findByText('인증 실패');
  expect(input).toHaveValue('replacement-ui-key-not-real');
  fireEvent.click(screen.getByRole('button', { name: '개인 API 연결 해제' }));
  expect(fetcher).toHaveBeenCalledTimes(3);
  fireEvent.click(screen.getByRole('button', { name: '키 삭제 및 연결 해제' }));
  await screen.findByText(/개인 API 연결을 해제했습니다/);
  expect(fetcher.mock.calls[3][1].method).toBe('DELETE');
  expect(input).toHaveValue('');
});
it('preserves an existing saved model instead of silently upgrading it', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        data: {
          ...initial,
          configured: true,
          model: 'gemini-3.7-flash',
          version: 1,
        },
      }),
    ),
  );
  render(<PersonalAiSettings isAdmin={false} />);
  await waitFor(() =>
    expect(screen.getByLabelText('사용할 모델')).toBeEnabled(),
  );
  expect(screen.getByLabelText('사용할 모델')).toHaveValue('gemini-3.7-flash');
});
