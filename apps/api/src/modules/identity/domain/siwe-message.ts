import type { WalletLinkPurpose } from '@dpp/shared';

/** Thời gian người dùng có để ký thông điệp sau khi bấm liên kết. */
export const SIWE_CHALLENGE_TTL_MS = 5 * 60_000;

/** EIP-4361 chỉ cho phép ký tự ASCII trong statement, nên dùng tiếng Anh không dấu. */
export const SIWE_STATEMENTS: Readonly<Record<WalletLinkPurpose, string>> = {
  LINK: 'Link this wallet to your Digital Product Passport account.',
  ROTATE: 'Use this wallet as the new personal wallet of your Digital Product Passport account.',
};

export interface SiweFields {
  /** Host của trang web (ví dụ `localhost:3000`); MetaMask so khớp với trang đang mở. */
  domain: string;
  /** Địa chỉ dạng checksum EIP-55. */
  address: string;
  statement: string;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}

/**
 * Dựng thông điệp Sign-In with Ethereum đúng ABNF của EIP-4361. Backend dựng lại từ dữ liệu
 * trong challenge token rồi so khớp từng ký tự, nên không cần parser phía server.
 */
export function buildSiweMessage(fields: SiweFields): string {
  return [
    `${fields.domain} wants you to sign in with your Ethereum account:`,
    fields.address,
    '',
    fields.statement,
    '',
    `URI: ${fields.uri}`,
    'Version: 1',
    `Chain ID: ${fields.chainId}`,
    `Nonce: ${fields.nonce}`,
    `Issued At: ${fields.issuedAt}`,
    `Expiration Time: ${fields.expirationTime}`,
  ].join('\n');
}
