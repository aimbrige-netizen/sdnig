import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '스딩 B2B 업체 관리',
  description: '스딩 앱 입점용 B2B 웨딩업체 데이터 수집 도구',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
