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
it('does not call a saved key connected and reports a generation failure without changing settings', async () => {
  const saved = {
    ...initial,
    configured: true,
    version: 2,
    model: 'gemini-3.7-flash',
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ data: saved }))
    .mockResolvedValueOnce(
      Response.json({
        data: {
          completed: false,
          httpStatus: 503,
          code: 'AI_PROVIDER_UNAVAILABLE',
          origin: 'GOOGLE_HTTP_RESPONSE',
        },
      }),
    )
    .mockResolvedValueOnce(Response.json({ data: saved }));
  vi.stubGlobal('fetch', fetcher);
  render(<PersonalAiSettings isAdmin />);
  expect(await screen.findByText('키 저장됨 · 생성은 별도 확인')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '짧은 문장 생성 시험' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 503');
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    action: 'probe-generation',
    version: 2,
  });
  fireEvent.click(screen.getByRole('button', { name: '새로 확인' }));
  expect(await screen.findByText('키 저장됨 · 생성은 별도 확인')).toBeTruthy();
  expect(screen.queryByText('연결 확인됨')).toBeNull();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('promotes an existing connection without sending a key from the browser', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ data: { ...initial, canPromotePersonal: true } }),
    )
    .mockResolvedValueOnce(
      Response.json({
        data: {
          ...initial,
          configured: true,
          version: 1,
          model: 'gemini-3.8-flash',
        },
      }),
    );
  vi.stubGlobal('fetch', fetcher);
  render(<PersonalAiSettings isAdmin />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: '기존 연결을 회사 공용으로 전환',
    }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls[1][0]).toBe('/api/settings/ai/company');
  expect(fetcher.mock.calls[1][1].method).toBe('PATCH');
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    action: 'promote-personal',
    version: 0,
  });
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
  await waitFor(() =>
    expect(screen.getByLabelText('Gemini API 키')).toBeEnabled(),
  );
  expect(save).toBeDisabled();
  expect(screen.getByLabelText('사용할 모델')).toHaveValue('gemini-3.8-flash');
  const input = screen.getByLabelText('Gemini API 키');
  const dottedKey = `AQ.${'a'.repeat(300)}`;
  expect(input).toHaveAttribute('maxlength', '512');
  fireEvent.change(input, { target: { value: dottedKey } });
  expect(save).toBeEnabled();
  fireEvent.click(save);
  await screen.findByText(/연결 확인 및 저장 완료/);
  expect(JSON.parse(fetcher.mock.calls[1][1].body).model).toBe(
    'gemini-3.8-flash',
  );
  expect(input).toHaveValue('');
  expect(JSON.parse(fetcher.mock.calls[1][1].body).apiKey).toBe(dottedKey);
  fireEvent.change(input, { target: { value: 'replacement-ui-key-not-real' } });
  fireEvent.click(save);
  await screen.findByText('인증 실패');
  expect(input).toHaveValue('replacement-ui-key-not-real');
  fireEvent.click(
    screen.getByRole('button', { name: '회사 공용 API 연결 해제' }),
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
  fireEvent.click(screen.getByRole('button', { name: '키 삭제 및 연결 해제' }));
  await screen.findByText(/회사 공용 API 연결을 해제했습니다/);
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

it('offers no guessed default and loads actual models without saving or clearing the draft key', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ data: { ...initial, availableModels: [] } }),
    )
    .mockResolvedValueOnce(
      Response.json({
        data: {
          availableModels: [
            {
              id: 'gemini-synthetic-current',
              label: 'gemini-synthetic-current',
            },
          ],
        },
      }),
    );
  vi.stubGlobal('fetch', fetcher);
  render(<PersonalAiSettings isAdmin={false} />);
  await waitFor(() =>
    expect(screen.getByLabelText('Gemini API 키')).toBeEnabled(),
  );
  expect(screen.getByLabelText('사용할 모델')).toHaveValue('');
  expect(
    screen.getByRole('button', { name: '연결 확인 후 저장' }),
  ).toBeDisabled();
  const key = 'synthetic-ui-api-key-not-real';
  fireEvent.change(screen.getByLabelText('Gemini API 키'), {
    target: { value: key },
  });
  fireEvent.click(
    screen.getByRole('button', { name: '사용 가능한 모델 조회' }),
  );
  await screen.findByText(/키는 아직 저장하지 않았습니다/);
  expect(fetcher.mock.calls[1][1].method).toBe('POST');
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    version: 0,
    apiKey: key,
  });
  expect(screen.getByLabelText('사용할 모델')).toHaveValue(
    'gemini-synthetic-current',
  );
  expect(screen.getByLabelText('Gemini API 키')).toHaveValue(key);
});

it('shows safe HTTP diagnostics for a non-JSON server failure without exposing its body', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ data: initial }))
    .mockResolvedValueOnce(
      new Response('private proxy details', { status: 500 }),
    );
  vi.stubGlobal('fetch', fetcher);
  render(<PersonalAiSettings isAdmin={false} />);
  await waitFor(() =>
    expect(screen.getByLabelText('Gemini API 키')).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText('Gemini API 키'), {
    target: { value: 'synthetic-key-1234567890' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: '사용 가능한 모델 조회' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 500');
  expect(screen.queryByText(/private proxy details/)).not.toBeInTheDocument();
});
