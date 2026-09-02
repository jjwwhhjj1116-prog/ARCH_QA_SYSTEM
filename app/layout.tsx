import type { Metadata, Viewport } from 'next';
import './globals.css';
import './qto-studio.css';
import './claim-center-theme.css';

export const metadata: Metadata = {
  title: 'CONCOST 기술본부 QC 스튜디오',
  description:
    '산출서와 집계표의 근거·계보·AI 검수·수량산출 분석표를 관리하는 사내 QC 시스템',
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
        data-design-contract="claim-center-workspace"
        data-design-seed="concost-qc-2026"
      >
        {children}
      </body>
    </html>
  );
}
