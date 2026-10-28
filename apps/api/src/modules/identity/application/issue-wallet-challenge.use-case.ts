import { Inject, Injectable } from '@nestjs/common';
import {
  normalizeAddress,
  toChecksumAddress,
  type WalletLinkChallenge,
  type WalletLinkPurpose,
} from '@dpp/shared';
import { randomBytes } from 'node:crypto';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { TRANSACTION_TRACKING, type TransactionTracking } from '../../chain-sync/index.js';
import {
  IdentityChainNotConfiguredError,
  InvalidWalletAddressError,
  SessionRequiredError,
  WalletAlreadyUsedError,
} from '../domain/identity.errors.js';
import { SIWE_CHALLENGE_TTL_MS } from '../domain/siwe-message.js';
import type { AuthenticatedUser } from '../domain/user-account.js';
import { planWalletBinding } from '../domain/wallet-binding-plan.js';
import { loadPersonalWalletState } from './personal-wallet-state.js';
import {
  PARTY_WALLET_REPOSITORY,
  type PartyWalletRepository,
} from './ports/party-wallet.repository.js';
import {
  WALLET_CHALLENGE_TOKENS,
  type WalletChallengeTokens,
} from './ports/wallet-challenge-tokens.port.js';
import {
  WALLET_LINK_AUTHORIZER,
  type WalletLinkAuthorizer,
} from './ports/wallet-link-authorizer.port.js';
import { WALLET_LINK_SETTINGS, type WalletLinkSettings } from './ports/wallet-link-settings.js';
import { siweMessageFor } from './siwe-challenge.js';

/** Nonce EIP-4361 phải là chữ và số, tối thiểu 8 ký tự; 10 byte ngẫu nhiên dạng hex là 20 ký tự. */
const NONCE_BYTES = 10;

@Injectable()
export class IssueWalletChallenge {
  constructor(
    @Inject(PARTY_WALLET_REPOSITORY) private readonly wallets: PartyWalletRepository,
    @Inject(WALLET_CHALLENGE_TOKENS) private readonly challenges: WalletChallengeTokens,
    @Inject(WALLET_LINK_AUTHORIZER) private readonly authorizer: WalletLinkAuthorizer,
    @Inject(WALLET_LINK_SETTINGS) private readonly settings: WalletLinkSettings,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TRANSACTION_TRACKING) private readonly tracker: TransactionTracking,
  ) {}

  /**
   * ACC-03/04 bước 1: kiểm tra sớm các quy tắc ví rồi tạo thông điệp EIP-4361 cho MetaMask ký.
   * Kiểm tra lại đầy đủ ở bước cấp giấy phép, vì trạng thái có thể đổi trong lúc chờ ký.
   */
  async execute(
    user: AuthenticatedUser,
    request: { address: string; purpose: WalletLinkPurpose },
  ): Promise<WalletLinkChallenge> {
    if (!this.authorizer.contractAddress) {
      throw new IdentityChainNotConfiguredError();
    }
    const address = parseAddress(request.address);
    const identity = await this.wallets.findIdentity(user.id);
    if (!identity) {
      throw new SessionRequiredError();
    }
    const plan = planWalletBinding(
      await loadPersonalWalletState(identity.wallets, this.tracker),
      address,
      request.purpose,
    );
    const existing = await this.wallets.findByAddress(address);
    if (existing && existing.id !== plan.reusePendingId) {
      throw new WalletAlreadyUsedError();
    }

    const now = this.clock.now();
    const claims = {
      userId: user.id,
      address,
      purpose: request.purpose,
      nonce: randomBytes(NONCE_BYTES).toString('hex'),
      issuedAt: now.toISOString(),
      expirationTime: new Date(now.getTime() + SIWE_CHALLENGE_TTL_MS).toISOString(),
    };
    return {
      purpose: request.purpose,
      address: toChecksumAddress(address),
      message: siweMessageFor(claims, this.settings),
      challengeToken: await this.challenges.issue(claims),
      expiresAt: claims.expirationTime,
    };
  }
}

function parseAddress(value: string): string {
  try {
    return normalizeAddress(value);
  } catch {
    throw new InvalidWalletAddressError();
  }
}
