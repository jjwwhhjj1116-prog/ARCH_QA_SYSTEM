'use client';

import { useState } from 'react';
import Image from 'next/image';
import { FileCheck2, Eye, EyeOff, LockKeyhole, ArrowRight } from 'lucide-react';
import {
  WorkspacePreferences,
  LanguageSwitch,
  useWorkspacePreferences,
} from './workspace-preferences';

export function EmployeeLogin() {
  return (
    <WorkspacePreferences>
      <LoginForm />
    </WorkspacePreferences>
  );
}
function LoginForm() {
  const { locale } = useWorkspacePreferences();
  const vi = locale === 'vi';
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const email = form.get('email');
    const password = form.get('password');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: typeof email === 'string' ? email.trim() : '',
          password: typeof password === 'string' ? password : '',
        }),
      });
      const body = (await response.json()) as {
        error?: { code: string; message: string };
      };
      if (!response.ok) {
        setError(
          body.error?.code === 'LOGIN_RATE_LIMIT'
            ? vi
              ? 'Quá nhiều lần đăng nhập. Hãy thử lại sau 15 phút.'
              : '로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.'
            : vi
              ? 'Kiểm tra tài khoản và mật khẩu. Nếu lỗi tiếp diễn, hãy liên hệ quản trị viên.'
              : (body.error?.message ??
                '로그인에 실패했습니다. 다시 시도해 주세요.'),
        );
        return;
      }
      window.location.assign('/');
    } catch {
      setError(
        vi
          ? 'Không thể kết nối máy chủ. Hãy thử lại.'
          : '서버에 연결하지 못했습니다. 다시 시도해 주세요.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="employee-login-page">
      <header className="employee-login-header">
        <Image
          className="brand-logo brand-logo-horizontal"
          src="/brand/concost-logo-horizontal.png"
          width={172}
          height={60}
          unoptimized
          alt="CON COST"
        />
        <LanguageSwitch />
      </header>
      <div className="employee-login-layout">
        <section className="employee-login-intro">
          <FileCheck2 size={44} aria-hidden="true" />
          <h1>
            {vi
              ? 'Kiểm tra khối lượng, có căn cứ rõ ràng.'
              : '산출서의 실수,\n근거로 확인합니다.'}
          </h1>
          <p>
            {vi
              ? 'QC Studio giúp nhóm hoàn thiện kiểm tra công thức và vật tư trùng lặp, đối chiếu bản gốc và lưu kết quả.'
              : '마감 산출서의 산식과 중복 아이템을 검토하고, 원본 근거와 함께 판단을 기록하는 QC 작업실입니다.'}
          </p>
          <ol>
            <li>{vi ? 'Đăng tải tài liệu' : '산출서·집계표 등록'}</li>
            <li>{vi ? 'Nhận diện và kiểm tra' : '자료 자동 확인·검수'}</li>
            <li>{vi ? 'Xem kết quả và báo cáo' : '근거 확인·보고서'}</li>
          </ol>
        </section>
        <section
          className="employee-login-card"
          aria-labelledby="employee-login-title"
        >
          <h2 id="employee-login-title">
            {vi ? 'Đăng nhập nhân viên' : '직원 로그인'}
          </h2>
          <p>
            {vi
              ? 'Sử dụng tài khoản do CONCOST cấp.'
              : '회사에서 발급한 QC 스튜디오 계정으로 시작하세요.'}
          </p>
          <form onSubmit={(event) => void submit(event)}>
            <label htmlFor="employee-email">
              {vi ? 'Email công ty' : '회사 이메일'}
            </label>
            <input
              id="employee-email"
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
              disabled={busy}
              placeholder="name@con-cost.com"
            />
            <label htmlFor="employee-password">
              {vi ? 'Mật khẩu' : '비밀번호'}
            </label>
            <div className="login-password-field">
              <input
                id="employee-password"
                name="password"
                type={visible ? 'text' : 'password'}
                autoComplete="current-password"
                required
                maxLength={256}
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => setVisible(!visible)}
                aria-label={vi ? 'Hiện hoặc ẩn mật khẩu' : '비밀번호 표시 전환'}
                aria-pressed={visible}
              >
                {visible ? <EyeOff /> : <Eye />}
              </button>
            </div>
            {error && (
              <p className="qc-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary-action employee-login-submit"
              disabled={busy}
              type="submit"
            >
              {busy
                ? vi
                  ? 'Đang đăng nhập…'
                  : '로그인 중…'
                : vi
                  ? 'Đăng nhập'
                  : '로그인'}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="login-help">
            {vi
              ? 'Quên mật khẩu? Liên hệ quản trị viên công ty. Không hỗ trợ đăng ký tự do.'
              : '비밀번호를 잊으셨나요? 사내 관리자에게 문의하세요. 별도 회원가입은 받지 않습니다.'}
          </p>
          <small>
            <LockKeyhole size={14} />
            {vi
              ? 'Chỉ tài khoản được cấp quyền mới có thể truy cập dữ liệu.'
              : '승인된 직원 계정만 내부 자료에 접근할 수 있습니다.'}
          </small>
        </section>
      </div>
    </main>
  );
}
