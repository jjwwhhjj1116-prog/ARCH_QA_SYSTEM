import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmployeeLogin } from './employee-login';
import { CompanyDriveSettings } from './company-drive-settings';
import { WorkspacePreferences } from './workspace-preferences';

vi.mock('next/image', () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  localStorage.removeItem('qc-workspace-preferences');
  vi.restoreAllMocks();
});

function checkLinks(locale: string) {
  for (const [href, name] of [
    [
      '/privacy',
      locale === 'vi' ? 'Chính sách quyền riêng tư' : '개인정보처리방침',
    ],
    ['/terms', locale === 'vi' ? 'Điều khoản sử dụng' : '이용약관'],
  ]) {
    const link = screen.getByRole('link', { name });
    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(link);
  }
  expect(screen.queryByRole('checkbox')).toBeNull();
}

describe('public legal links', () => {
  it.each(['ko', 'vi'])(
    'keeps login credentials untouched while opening policy links (%s)',
    (locale) => {
      localStorage.setItem(
        'qc-workspace-preferences',
        JSON.stringify({ locale }),
      );
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      render(<EmployeeLogin />);
      const email = screen.getByLabelText(
        locale === 'vi' ? 'Email công ty' : '회사 이메일',
      );
      const password = screen.getByLabelText(
        locale === 'vi' ? 'Mật khẩu' : '비밀번호',
      );
      fireEvent.change(email, {
        target: { value: 'synthetic@example.invalid' },
      });
      fireEvent.change(password, {
        target: { value: 'synthetic-not-a-real-password' },
      });
      checkLinks(locale);
      expect(email).toHaveValue('synthetic@example.invalid');
      expect(password).toHaveValue('synthetic-not-a-real-password');
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each(['ko', 'vi'])(
    'preserves unsaved Drive inputs and never starts OAuth for a policy link (%s)',
    async (locale) => {
      localStorage.setItem(
        'qc-workspace-preferences',
        JSON.stringify({ locale }),
      );
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              version: 0,
              clientId: '',
              targetEmail: 'synthetic@example.invalid',
              configured: false,
              encryptionReady: true,
              current: null,
              callback: 'https://example.invalid/api/settings/drive/callback',
            },
          }),
        ),
      );
      render(
        <WorkspacePreferences>
          <CompanyDriveSettings />
        </WorkspacePreferences>,
      );
      const clientId = screen.getByLabelText('OAuth Client ID');
      await waitFor(() => expect(clientId).toBeEnabled());
      fireEvent.change(clientId, {
        target: { value: 'synthetic.apps.googleusercontent.com' },
      });
      const secret = screen.getByLabelText('OAuth Client Secret');
      fireEvent.change(secret, {
        target: { value: 'synthetic-not-a-real-secret' },
      });
      checkLinks(locale);
      expect(clientId).toHaveValue('synthetic.apps.googleusercontent.com');
      expect(secret).toHaveValue('synthetic-not-a-real-secret');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][1]?.method).toBe('GET');
    },
  );
});
