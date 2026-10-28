import type { WalletBinding } from '@dpp/shared';

/** Ký giấy phép EIP-712 bằng khoá REGISTRAR_ROLE; không gửi giao dịch, không cần MON. */
export interface WalletLinkAuthorizer {
  /** `null` khi chưa cấu hình khoá ký hoặc địa chỉ PartyRegistry. */
  readonly contractAddress: string | null;
  readonly chainId: number;
  sign(binding: WalletBinding): Promise<string>;
}

export const WALLET_LINK_AUTHORIZER = Symbol('WALLET_LINK_AUTHORIZER');
