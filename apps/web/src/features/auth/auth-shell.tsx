import type { ReactNode } from 'react';
import { Panel } from '@/components/ui/panel';

/** Khung chung của trang đăng nhập/đăng ký: tiêu đề, form trong khối, liên kết phụ bên dưới. */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-14 sm:py-20">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">{description}</p>
      <Panel className="mt-8 px-5 py-6 sm:px-6">{children}</Panel>
      <p className="mt-6 text-sm text-muted">{footer}</p>
    </div>
  );
}
