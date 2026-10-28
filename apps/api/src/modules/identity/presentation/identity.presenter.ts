import {
  type IdentitySnapshot,
  partyIdFromUuid,
  toChecksumAddress,
  type WalletSummary,
} from '@dpp/shared';
import type { IdentityRecord, WalletRecord } from '../application/ports/party-wallet.repository.js';

export function presentWallet(wallet: WalletRecord): WalletSummary {
  return {
    id: wallet.id,
    address: toChecksumAddress(wallet.address),
    custodyType: wallet.custodyType,
    walletRole: wallet.walletRole,
    status: wallet.status,
    activatedAt: wallet.activatedAt?.toISOString() ?? null,
    revokedAt: wallet.revokedAt?.toISOString() ?? null,
    linkTxHash: wallet.linkTxHash,
    createdAt: wallet.createdAt.toISOString(),
  };
}

export function presentIdentity(identity: IdentityRecord): IdentitySnapshot {
  const { account, party } = identity;
  return {
    account: {
      id: account.id,
      email: account.email,
      fullName: account.fullName,
      systemRole: account.systemRole,
      createdAt: account.createdAt.toISOString(),
    },
    party: {
      id: party.id,
      partyType: party.partyType,
      partyId: party.chainPartyId ?? partyIdFromUuid(party.id),
      registeredOnChain: party.chainPartyId !== null,
    },
    wallets: identity.wallets.map(presentWallet),
  };
}
