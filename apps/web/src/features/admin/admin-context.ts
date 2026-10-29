import type { AdminOverview } from '@dpp/shared';
import { notFound, redirect } from 'next/navigation';
import { getIdentity } from '@/features/auth/get-identity';
import type { AdminContext } from './admin-flows';

/** Chỉ Admin mới vào khu Quản trị; người khác nhận 404 để không lộ đường dẫn. */
export async function requireAdmin(): Promise<void> {
  const identity = await getIdentity();
  if (!identity) {
    redirect('/login');
  }
  if (identity.account.systemRole !== 'ADMIN') {
    notFound();
  }
}

/** Contract và ví Admin để ký quyết định; `null` khi ví chưa liên kết hoặc không có quyền Admin. */
export function adminContextOf(
  overview: AdminOverview | null,
  chainId: number,
): AdminContext | null {
  return overview?.contract && overview.adminWallet && overview.walletHasAdminRole !== false
    ? { chainId, contractAddress: overview.contract.address, wallet: overview.adminWallet }
    : null;
}
