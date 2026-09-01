import type { Metadata, Viewport } from 'next';
import './globals.css';
import './qto-studio.css';

export const metadata: Metadata = {
  title: 'QTO QA & Analytics Studio',
  description:
    '산출서와 집계표의 근거·계보·검수 결과를 확인하는 사내 검수 시스템',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        data-design-contract="high-tech-dark-glass"
        data-design-seed="9f1a8b94"
      >
        {children}
      </body>
    </html>
  );
}
