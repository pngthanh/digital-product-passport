import type { WalletLinkPurpose } from '@dpp/shared';

/** Toàn bộ dữ liệu cần để dựng lại đúng thông điệp EIP-4361 đã đưa cho ví ký. */
export interface WalletChallengeClaims {
  userId: string;
  /** Chữ thường. */
  address: string;
  purpose: WalletLinkPurpose;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}

/** Challenge không lưu CSDL: token ký HMAC, ràng buộc người dùng, ví và mục đích. */
export interface WalletChallengeTokens {
  issue(claims: WalletChallengeClaims): Promise<string>;
  verify(token: string): Promise<WalletChallengeClaims | null>;
}

export const WALLET_CHALLENGE_TOKENS = Symbol('WALLET_CHALLENGE_TOKENS');
