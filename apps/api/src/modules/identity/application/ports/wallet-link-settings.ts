/** Thông số EIP-4361 và giấy phép, lấy từ cấu hình khi khởi tạo module. */
export interface WalletLinkSettings {
  /** Host của web (ví dụ `localhost:3000`). */
  siweDomain: string;
  /** Origin của web (ví dụ `http://localhost:3000`). */
  siweUri: string;
  chainId: number;
  /** Thời gian ví có để gửi giao dịch sau khi nhận giấy phép. */
  authorizationTtlSeconds: number;
}

export const WALLET_LINK_SETTINGS = Symbol('WALLET_LINK_SETTINGS');
