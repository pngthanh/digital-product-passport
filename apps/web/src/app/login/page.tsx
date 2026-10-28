import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/features/auth/auth-shell';
import { getIdentity } from '@/features/auth/get-identity';
import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = { title: 'Đăng nhập' };

export default async function LoginPage() {
  if (await getIdentity()) {
    redirect('/account');
  }
  return (
    <AuthShell
      title="Đăng nhập"
      description="Dùng email và mật khẩu đã đăng ký. Ví MetaMask chỉ cần khi ký giao dịch."
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link
            href="/register"
            className="font-medium text-tint-ink underline-offset-4 hover:underline"
          >
            Đăng ký
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
