import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountSettings } from './account-settings';
import { WorkspacePreferences } from './workspace-preferences';

function renderSettings() {
  return render(
    <WorkspacePreferences>
      <AccountSettings email="reviewer@example.com" displayName="검토자" />
    </WorkspacePreferences>,
  );
}

function fillPasswords(
  current = 'current-password',
  next = 'new-password-123',
) {
  fireEvent.change(screen.getByLabelText('현재 비밀번호'), {
    target: { value: current },
  });
  fireEvent.change(screen.getByLabelText('새 비밀번호'), {
    target: { value: next },
  });
  fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), {
    target: { value: next },
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('submits only the current and new passwords, disables while busy, and clears only after success', async () => {
  let resolveRequest: ((value: Response) => void) | undefined;
  let requestBody = '';
  const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = typeof init?.body === 'string' ? init.body : '';
    return new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
  });
  vi.stubGlobal('fetch', fetcher);
  renderSettings();

  expect(screen.getByLabelText('현재 비밀번호')).toHaveAttribute(
    'autocomplete',
    'current-password',
  );
  expect(screen.getByLabelText('새 비밀번호')).toHaveAttribute(
    'autocomplete',
    'new-password',
  );
  expect(screen.getByLabelText('새 비밀번호')).toHaveAttribute(
    'minlength',
    '12',
  );
  expect(screen.getByLabelText('새 비밀번호')).toHaveAttribute(
    'maxlength',
    '128',
  );
  fillPasswords();
  fireEvent.submit(
    screen.getByRole('button', { name: '비밀번호 변경' }).closest('form')!,
  );

  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText('현재 비밀번호')).toBeDisabled();
  expect(screen.getByRole('button', { name: '변경 중…' })).toBeDisabled();
  expect(JSON.parse(requestBody)).toEqual({
    currentPassword: 'current-password',
    newPassword: 'new-password-123',
  });

  resolveRequest!(Response.json({ data: { changed: true } }));
  await screen.findByRole('status');
  expect(screen.getByLabelText('현재 비밀번호')).toHaveValue('');
  expect(screen.getByLabelText('새 비밀번호')).toHaveValue('');
  expect(screen.getByLabelText('새 비밀번호 확인')).toHaveValue('');
  expect(screen.getByRole('link', { name: '다시 로그인' })).toHaveAttribute(
    'href',
    '/',
  );
});

it('blocks mismatched values without sending a password request', () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  renderSettings();
  fillPasswords('current-password', 'new-password-123');
  fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), {
    target: { value: 'a-different-password' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: '비밀번호 변경' }).closest('form')!,
  );

  expect(screen.getByRole('alert')).toHaveTextContent(
    '새 비밀번호가 일치하지 않습니다.',
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it('keeps values and shows a safe error for a rejected current password', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            code: 'CURRENT_PASSWORD_INVALID',
            message: 'private error detail',
          },
        },
        { status: 401 },
      ),
    ),
  );
  renderSettings();
  fillPasswords();
  fireEvent.submit(
    screen.getByRole('button', { name: '비밀번호 변경' }).closest('form')!,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '현재 비밀번호가 맞지 않습니다.',
  );
  expect(screen.queryByText('private error detail')).not.toBeInTheDocument();
  expect(screen.getByLabelText('현재 비밀번호')).toHaveValue(
    'current-password',
  );
  expect(
    screen.queryByRole('link', { name: '다시 로그인' }),
  ).not.toBeInTheDocument();
});

it('uses Vietnamese labels from the saved workspace locale', () => {
  localStorage.setItem(
    'qc-workspace-preferences',
    JSON.stringify({ locale: 'vi', sidebarWidth: 248 }),
  );
  renderSettings();
  expect(
    screen.getByRole('heading', { name: 'Bảo mật tài khoản' }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Mật khẩu hiện tại')).toBeRequired();
});
