'use client';
import { useEffect, useState } from 'react';
import { HardDrive, Link2, RefreshCw } from 'lucide-react';
import type { driveSettingsService } from '@/lib/files/drive-settings';
import { useWorkspacePreferences } from './workspace-preferences';

type Status = Awaited<
  ReturnType<ReturnType<typeof driveSettingsService>['status']>
>;
async function request<T>(
  method: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const result = await fetch('/api/settings/drive', {
    method,
    signal,
    cache: 'no-store',
    ...(body
      ? {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const envelope = (await result.json()) as {
    data: T;
    error?: { message: string };
  };
  if (!result.ok || envelope.error)
    throw new Error(
      envelope.error?.message ??
        'Drive 연결 요청 실패 / Không thể kết nối Drive',
    );
  return envelope.data;
}
export function CompanyDriveSettings() {
  const { locale } = useWorkspacePreferences();
  const t = (ko: string, vi: string) => (locale === 'vi' ? vi : ko);
  const [status, setStatus] = useState<Status | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [email, setEmail] = useState('concost.dt@gmail.com');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const dirty = Boolean(
    clientSecret ||
    (status && (email !== status.targetEmail || clientId !== status.clientId)),
  );
  function accept(value: Status) {
    setStatus(value);
    setClientId(value.clientId);
    setEmail(value.targetEmail);
  }
  useEffect(() => {
    const controller = new AbortController();
    request<Status>('GET', undefined, controller.signal)
      .then(accept)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setFailed(true);
          setMessage(
            error instanceof Error ? error.message : 'Drive 설정 오류',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function act(action: 'connect' | 'check' | 'reload') {
    setBusy(true);
    setFailed(false);
    setMessage('');
    try {
      if (action === 'reload') {
        accept(await request<Status>('GET'));
        return;
      }
      let current = status;
      if (action === 'connect') {
        if (dirty || !status?.configured) {
          current = await request<Status>('PUT', {
            version: status?.version ?? 0,
            clientId,
            targetEmail: email,
            ...(clientSecret.trim()
              ? { clientSecret: clientSecret.trim() }
              : {}),
          });
          accept(current);
          setClientSecret('');
        }
        const result = await request<{ url: string }>('POST', {
          action,
          version: current!.version,
        });
        const url = new URL(result.url);
        if (url.origin !== 'https://accounts.google.com')
          throw new Error('Google 연결 주소를 확인하지 못했습니다.');
        window.location.assign(url.toString());
      } else {
        const result = await request<{
          email: string;
          quota: { limit?: string; usage?: string } | null;
        }>('POST', { action, version: current!.version });
        const gib = (value: string) =>
          (
            Number((BigInt(value) * BigInt(100)) / BigInt(1073741824)) / 100
          ).toLocaleString();
        setMessage(
          `${t('연결 정상', 'Kết nối thành công')} · ${result.email} · ${t('사용량', 'Đã dùng')}: ${result.quota?.usage ? `${gib(result.quota.usage)} GiB` : t('정보 없음', 'Không có dữ liệu')} / ${result.quota?.limit ? `${gib(result.quota.limit)} GiB` : t('총 용량 정보 없음', 'Không có giới hạn dung lượng')}`,
        );
      }
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'Drive 연결 오류');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="settings-card personal-ai-settings"
      aria-labelledby="company-drive-title"
      aria-busy={busy}
    >
      <div className="panel-heading">
        <h2 id="company-drive-title">
          <HardDrive aria-hidden="true" />{' '}
          {t(
            '회사 Google Drive · 관리자',
            'Google Drive công ty · Quản trị viên',
          )}
        </h2>
        <span className="qc-connection-state">
          {status?.current
            ? t('연결 저장됨', 'Đã lưu kết nối')
            : t('미연결', 'Chưa kết nối')}
        </span>
      </div>
      <p>
        {t(
          '직원은 QC 계정으로 로그인합니다. 관리자가 연결한 Drive의 QC 전용 폴더에 저장합니다.',
          'Nhân viên đăng nhập bằng tài khoản QC. Tệp được lưu trong thư mục QC riêng trên Drive của công ty.',
        )}
      </p>
      {status?.current && (
        <p>
          <strong>
            {t('현재 저장 계정', 'Tài khoản lưu trữ')}: {status.current.email}
          </strong>
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void act('connect');
        }}
      >
        <label htmlFor="drive-account">
          {t('연결할 Google 계정', 'Tài khoản Google cần kết nối')}
        </label>
        <input
          id="drive-account"
          type="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy}
        />
        <details open={!status?.configured}>
          <summary>
            {t(
              '최초 연결 · Google OAuth 앱 설정',
              'Thiết lập ứng dụng Google OAuth lần đầu',
            )}
          </summary>
          <p>
            {t(
              'Google Cloud에서 Drive API를 켜고 웹 애플리케이션 OAuth 클라이언트를 등록합니다. 아래 콜백 주소를 승인된 리디렉션 URI에 추가하세요.',
              'Bật Drive API và tạo OAuth client loại ứng dụng web trong Google Cloud. Thêm địa chỉ callback bên dưới vào URI chuyển hướng được phép.',
            )}
          </p>
          <p style={{ overflowWrap: 'anywhere' }}>{status?.callback}</p>
          <label htmlFor="drive-client-id">OAuth Client ID</label>
          <input
            id="drive-client-id"
            required
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            disabled={busy}
            autoComplete="off"
          />
          <label htmlFor="drive-client-secret">OAuth Client Secret</label>
          <input
            id="drive-client-secret"
            type="password"
            required={!status?.configured}
            maxLength={4096}
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            disabled={busy}
            autoComplete="new-password"
          />
          <p>
            {t(
              '저장한 비밀번호는 다시 표시하지 않습니다. 계정만 바꿀 때는 비워 두세요.',
              'Mật khẩu đã lưu không được hiển thị lại. Để trống khi chỉ thay đổi tài khoản.',
            )}
          </p>
        </details>
        <p>
          {t(
            '계정 변경은 새 연결이 성공한 뒤 적용됩니다. 기존 파일은 이동·삭제하지 않으며 이전 연결로 계속 읽습니다.',
            'Tài khoản mới chỉ được áp dụng sau khi kết nối thành công. Tệp cũ không bị di chuyển hoặc xóa và vẫn sử dụng kết nối trước.',
          )}
        </p>
        <div className="personal-settings-actions">
          <button
            type="submit"
            className="primary-action"
            disabled={busy || !status?.encryptionReady}
          >
            <Link2 aria-hidden="true" />{' '}
            {busy
              ? t('처리 중…', 'Đang xử lý…')
              : status?.current
                ? t(
                    '저장하고 계정 변경·재연결',
                    'Lưu và đổi/kết nối lại tài khoản',
                  )
                : t('저장하고 Google 연결', 'Lưu và kết nối Google')}
          </button>
          <button
            type="button"
            onClick={() => void act('check')}
            disabled={busy || !status?.current || dirty}
          >
            <RefreshCw aria-hidden="true" />{' '}
            {t('연결·용량 확인', 'Kiểm tra kết nối và dung lượng')}
          </button>
          <button
            type="button"
            onClick={() => void act('reload')}
            disabled={busy || dirty}
          >
            {t('새로 확인', 'Tải lại')}
          </button>
        </div>
      </form>
      <p>
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          title={t('새 탭에서 열기', 'Mở trong tab mới')}
        >
          {t('개인정보처리방침', 'Chính sách quyền riêng tư')}
        </a>
        {' · '}
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          title={t('새 탭에서 열기', 'Mở trong tab mới')}
        >
          {t('이용약관', 'Điều khoản sử dụng')}
        </a>
      </p>
      {status && !status.encryptionReady && (
        <p role="alert">
          {t(
            '서버 암호화 설정이 준비되지 않았습니다. 아직 비밀번호를 저장할 수 없습니다.',
            'Mã hóa máy chủ chưa sẵn sàng. Chưa thể lưu mật khẩu.',
          )}
        </p>
      )}
      {message && (
        <p
          role={failed ? 'alert' : 'status'}
          className={failed ? 'qc-field-error' : 'settings-safety-note'}
        >
          {message}
        </p>
      )}
    </section>
  );
}
