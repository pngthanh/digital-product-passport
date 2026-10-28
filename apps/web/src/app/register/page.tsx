import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/features/auth/auth-shell';
import { getIdentity } from '@/features/auth/get-identity';
import { RegisterForm } from '@/features/auth/register-form';

export const metadata: Metadata = { title: 'Đăng ký' };

export default async function RegisterPage() {
  if (await getIdentity()) {
    redirect('/account');
  }
  return (
    <AuthShell
      title="Tạo tài khoản"
      description="Tài khoản giữ hồ sơ của bạn trong hệ thống. Bước này chưa ghi gì lên blockchain."
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link
            href="/login"
            className="font-medium text-tint-ink underline-offset-4 hover:underline"
          >
            Đăng nhập
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
