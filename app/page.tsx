import { ReviewStudio } from './review-studio';
import { chatGPTSignInPath, getChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();
  const isLocalDemo = process.env.LOCAL_DEMO_MODE === 'true';
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
            Sites 액세스 정책에 등록된 계정으로 인증한 후 QTO QA &amp; Analytics
            Studio를 이용할 수 있습니다.
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
