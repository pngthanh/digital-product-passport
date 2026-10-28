import type { SystemRole, UserStatus } from '@dpp/shared';

/** Tài khoản đăng nhập (bảng users, dữ liệu [A]). */
export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  systemRole: SystemRole;
  status: UserStatus;
  /** Phiên bản phiên đăng nhập; JWT phải mang đúng giá trị này. */
  sessionVersion: number;
  passwordHash: string;
  createdAt: Date;
}

/** Người dùng đã xác thực, gắn vào request sau khi kiểm tra phiên. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  systemRole: SystemRole;
}

export function canSignIn(account: Pick<UserAccount, 'status'>): boolean {
  return account.status === 'ACTIVE';
}

/** Phiên hợp lệ khi tài khoản còn hoạt động và chưa bị thu hồi bằng session_version. */
export function isSessionValid(
  account: Pick<UserAccount, 'status' | 'sessionVersion'>,
  tokenSessionVersion: number,
): boolean {
  return canSignIn(account) && account.sessionVersion === tokenSessionVersion;
}

export function toAuthenticatedUser(account: UserAccount): AuthenticatedUser {
  return {
    id: account.id,
    email: account.email,
    fullName: account.fullName,
    systemRole: account.systemRole,
  };
}
