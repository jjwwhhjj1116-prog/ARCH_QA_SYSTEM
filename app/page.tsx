import { ReviewStudio } from './review-studio';
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from './chatgpt-auth';
import {
  AccountAccessError,
  assertAccountAllowed,
} from '@/lib/auth/account-access';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();
  const isLocalDemo =
    process.env.NODE_ENV !== 'production' &&
    process.env.LOCAL_DEMO_MODE === 'true';
  if (!user && !isLocalDemo) {
    return (
      <main className="auth-gate">
        <section className="auth-card" aria-labelledby="auth-title">
          <span className="auth-mark" aria-hidden="true">
            <span />
          </span>
          <p className="eyebrow">CON COST INTERNAL</p>
          <h1 id="auth-title">승인된 계정 전용 검수 시스템</h1>
          <p>
            Sites 액세스 정책과 사내 승인 목록에 등록된 계정으로 인증한 후
            CONCOST 기술본부 QC 스튜디오를 이용할 수 있습니다.
          </p>
          <a
            className="primary-action"
            href={chatGPTSignInPath('/')}
            target="_top"
          >
            승인 계정으로 로그인
          </a>
          <small>
            현재는 Sites 비공개 접근 목록으로 제한하며, 전사 임직원 명부 연동은
            후속 권한 과제입니다.
          </small>
        </section>
      </main>
    );
  }

  if (user) {
    try {
      assertAccountAllowed(
        user.email,
        process.env.APP_ALLOWED_EMAILS,
        process.env.NODE_ENV === 'production' ? 'production' : 'development',
      );
    } catch (error) {
      const accessError =
        error instanceof AccountAccessError
          ? error
          : new AccountAccessError(
              '승인 계정 정책을 확인하지 못했습니다.',
              'ACCESS_POLICY_UNAVAILABLE',
              503,
            );
      return (
        <main className="auth-gate">
          <section className="auth-card" aria-labelledby="access-title">
            <p className="eyebrow">CON COST INTERNAL</p>
            <h1 id="access-title">
              {accessError.status === 403
                ? '사용 승인이 필요한 계정입니다'
                : '계정 정책을 확인할 수 없습니다'}
            </h1>
            <p>{accessError.message}</p>
            <a
              className="primary-action"
              href={chatGPTSignOutPath('/')}
              target="_top"
            >
              다른 계정으로 로그인
            </a>
            <small>요청 계정: {user.email}</small>
          </section>
        </main>
      );
    }
  }

  const currentUser = user ?? {
    displayName: '로컬 검증 계정',
    email: 'LOCAL_DEMO_MODE',
  };
  return (
    <ReviewStudio
      isLocalDemo={isLocalDemo}
      currentUser={{
        displayName: currentUser.displayName,
        email: currentUser.email,
      }}
    />
  );
}
