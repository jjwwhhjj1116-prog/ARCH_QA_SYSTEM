'use client';

import { type SubmitEvent, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useWorkspacePreferences } from './workspace-preferences';

type AccountSettingsProps = {
  email: string;
  displayName: string;
};

type PasswordChangeResponse = {
  data?: { changed?: boolean };
  error?: { code?: string };
};

export function AccountSettings({ email, displayName }: AccountSettingsProps) {
  const { locale } = useWorkspacePreferences();
  const t = (ko: string, vi: string) => (locale === 'vi' ? vi : ko);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState(false);
  const passwordsMatch = newPassword === confirmation;
  const confirmationIsInvalid = confirmation.length > 0 && !passwordsMatch;

  const safeError = (status?: number, code?: string) => {
    if (code === 'CURRENT_PASSWORD_INVALID')
      return t(
        '현재 비밀번호가 맞지 않습니다.',
        'Mật khẩu hiện tại không đúng.',
      );
    if (code === 'PASSWORD_UNCHANGED')
      return t(
        '기존 비밀번호와 다른 새 비밀번호를 입력해 주세요.',
        'Hãy nhập mật khẩu mới khác mật khẩu hiện tại.',
      );
    if (code === 'INVALID_PASSWORD_INPUT')
      return t(
        '현재 비밀번호와 12~128자의 새 비밀번호를 확인해 주세요.',
        'Hãy kiểm tra mật khẩu hiện tại và mật khẩu mới gồm 12–128 ký tự.',
      );
    if (status === 401)
      return t(
        '로그인 상태를 확인한 뒤 다시 시도해 주세요.',
        'Hãy kiểm tra trạng thái đăng nhập rồi thử lại.',
      );
    if (status === 429)
      return t(
        '시도가 많습니다. 잠시 후 다시 시도해 주세요.',
        'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.',
      );
    return t(
      '비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      'Không thể đổi mật khẩu. Vui lòng thử lại sau.',
    );
  };

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setChanged(false);
    if (!passwordsMatch) {
      setError(
        t('새 비밀번호가 일치하지 않습니다.', 'Mật khẩu mới không khớp.'),
      );
      return;
    }
    if (!currentPassword) {
      setError(
        t('현재 비밀번호를 입력해 주세요.', 'Hãy nhập mật khẩu hiện tại.'),
      );
      return;
    }
    if (newPassword.length < 12 || newPassword.length > 128) {
      setError(
        t(
          '새 비밀번호는 12~128자로 입력해 주세요.',
          'Mật khẩu mới phải có từ 12 đến 128 ký tự.',
        ),
      );
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as PasswordChangeResponse | null;
      if (!response.ok || payload?.data?.changed !== true) {
        setError(safeError(response.status, payload?.error?.code));
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setChanged(true);
    } catch {
      setError(safeError());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="settings-card personal-ai-settings"
      aria-labelledby="account-settings-title"
    >
      <h2 id="account-settings-title">
        <KeyRound aria-hidden="true" />
        {t('계정 보안', 'Bảo mật tài khoản')}
      </h2>
      <p>
        {t(
          '비밀번호를 변경하면 모든 로그인 세션이 종료됩니다.',
          'Khi đổi mật khẩu, mọi phiên đăng nhập sẽ kết thúc.',
        )}
      </p>
      <p className="settings-safety-note">
        <span>{displayName}</span>
        <span aria-hidden="true">·</span>
        <span>{email}</span>
      </p>

      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label htmlFor="current-password">
            {t('현재 비밀번호', 'Mật khẩu hiện tại')}
          </label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />

          <label htmlFor="new-password">
            {t('새 비밀번호', 'Mật khẩu mới')}
          </label>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />

          <label htmlFor="confirm-password">
            {t('새 비밀번호 확인', 'Xác nhận mật khẩu mới')}
          </label>
          <input
            id="confirm-password"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            aria-invalid={confirmationIsInvalid || undefined}
            aria-describedby={
              confirmationIsInvalid ? 'password-confirmation-error' : undefined
            }
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          {confirmationIsInvalid ? (
            <p id="password-confirmation-error" className="qc-field-error">
              {t(
                '새 비밀번호가 일치하지 않습니다.',
                'Mật khẩu mới không khớp.',
              )}
            </p>
          ) : null}
        </fieldset>

        {error ? (
          <p className="personal-settings-error" role="alert">
            {error}
          </p>
        ) : null}
        {changed ? (
          <output className="personal-settings-success">
            {t('비밀번호를 변경했습니다. ', 'Đã đổi mật khẩu. ')}
            {/* Vinext does not provide next/link; the cleared server session needs a normal navigation link. */}
            {/* oxlint-disable-next-line next/no-html-link-for-pages */}
            <a href="/">{t('다시 로그인', 'Đăng nhập lại')}</a>
          </output>
        ) : null}

        <div className="personal-settings-actions">
          <button type="submit" className="primary-action" disabled={busy}>
            {busy
              ? t('변경 중…', 'Đang thay đổi…')
              : t('비밀번호 변경', 'Đổi mật khẩu')}
          </button>
          <span>
            {t(
              '새 비밀번호는 12~128자로 입력하세요.',
              'Mật khẩu mới cần có 12–128 ký tự.',
            )}
          </span>
        </div>
      </form>
    </section>
  );
}
