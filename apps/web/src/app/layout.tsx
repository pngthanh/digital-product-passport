import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export const metadata: Metadata = {
  title: {
    default: 'Hộ chiếu số sản phẩm',
    template: '%s | Hộ chiếu số sản phẩm',
  },
  description:
    'Hồ sơ số theo dõi vòng đời, bảo hành và quyền sở hữu sản phẩm, ghi nhận trên blockchain Monad.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="flex min-h-dvh flex-col">
        <a
          href="#noi-dung"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-20 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
        >
          Bỏ qua tới nội dung
        </a>
        <SiteHeader />
        <main id="noi-dung" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
