/* oxlint-disable next/no-html-link-for-pages -- Public policy documents use native navigation without client routing. */
import type { ReactNode } from 'react';

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <a href="/" className="legal-brand">
          CONCOST <span>QC 스튜디오</span>
        </a>
        <nav aria-label="문서 메뉴">
          <a href="/">홈</a>
          <a
            href="/privacy"
            aria-current={title === '개인정보처리방침' ? 'page' : undefined}
          >
            개인정보처리방침
          </a>
          <a
            href="/terms"
            aria-current={title === '이용약관' ? 'page' : undefined}
          >
            이용약관
          </a>
        </nav>
      </header>
      <main className="legal-document">
        <h1>{title}</h1>
        <p className="legal-date">시행일 · 최종 수정일: 2026년 9월 8일</p>
        {children}
      </main>
      <footer className="legal-footer">
        CONCOST 기술본부 · 문의{' '}
        <a href="mailto:concost.dt@gmail.com">concost.dt@gmail.com</a>
      </footer>
    </div>
  );
}
