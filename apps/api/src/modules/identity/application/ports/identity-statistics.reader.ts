/** (M12) Số liệu tài khoản cho dashboard Admin (AUD-02). */
export interface AccountStatistics {
  total: number;
  /** Người dùng có ví cá nhân đang ACTIVE. */
  withWallet: number;
  admins: number;
}

export interface IdentityStatistics {
  accounts(): Promise<AccountStatistics>;
}

export const IDENTITY_STATISTICS = Symbol('IDENTITY_STATISTICS');
