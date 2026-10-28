import { toChecksumAddress } from '@dpp/shared';
import { buildSiweMessage, SIWE_STATEMENTS } from '../domain/siwe-message.js';
import type { WalletChallengeClaims } from './ports/wallet-challenge-tokens.port.js';
import type { WalletLinkSettings } from './ports/wallet-link-settings.js';

/** Thông điệp EIP-4361 dựng lại y hệt từ dữ liệu challenge, dùng chung khi cấp và khi xác minh. */
export function siweMessageFor(
  claims: WalletChallengeClaims,
  settings: WalletLinkSettings,
): string {
  return buildSiweMessage({
    domain: settings.siweDomain,
    address: toChecksumAddress(claims.address),
    statement: SIWE_STATEMENTS[claims.purpose],
    uri: settings.siweUri,
    chainId: settings.chainId,
    nonce: claims.nonce,
    issuedAt: claims.issuedAt,
    expirationTime: claims.expirationTime,
  });
}
