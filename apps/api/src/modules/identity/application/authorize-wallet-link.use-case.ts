import { Inject, Injectable } from '@nestjs/common';
import {
  bindingMethod,
  partyIdFromUuid,
  toChecksumAddress,
  type WalletBinding,
  type WalletLinkAuthorization,
} from '@dpp/shared';
import { verifyMessage, ZeroAddress } from 'ethers';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { TRANSACTION_TRACKING, type TransactionTracking } from '../../chain-sync/index.js';
import {
  BlockchainUnavailableError,
  ChainOutOfSyncError,
  IdentityChainNotConfiguredError,
  PasswordConfirmationError,
  SessionRequiredError,
  WalletAlreadyUsedError,
  WalletChallengeInvalidError,
  WalletSignatureMismatchError,
} from '../domain/identity.errors.js';
import type { AuthenticatedUser } from '../domain/user-account.js';
import { planWalletBinding } from '../domain/wallet-binding-plan.js';
import { loadPersonalWalletState } from './personal-wallet-state.js';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './ports/account.repository.js';
import { PASSWORD_HASHER, type PasswordHasher } from './ports/password-hasher.port.js';
import {
  PARTY_REGISTRY_READER,
  type PartyRegistryReader,
} from './ports/party-registry-reader.port.js';
import {
  PARTY_WALLET_REPOSITORY,
  type PartyWalletRepository,
} from './ports/party-wallet.repository.js';
import {
  type WalletChallengeClaims,
  WALLET_CHALLENGE_TOKENS,
  type WalletChallengeTokens,
} from './ports/wallet-challenge-tokens.port.js';
import {
  WALLET_LINK_AUTHORIZER,
  type WalletLinkAuthorizer,
} from './ports/wallet-link-authorizer.port.js';
import { WALLET_LINK_SETTINGS, type WalletLinkSettings } from './ports/wallet-link-settings.js';
import { siweMessageFor } from './siwe-challenge.js';

export interface AuthorizeWalletLinkCommand {
  challengeToken: string;
  signature: string;
  /** Bắt buộc khi xoay ví (ACC-04). */
  password?: string;
}

@Injectable()
export class AuthorizeWalletLink {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(PARTY_WALLET_REPOSITORY) private readonly wallets: PartyWalletRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(WALLET_CHALLENGE_TOKENS) private readonly challenges: WalletChallengeTokens,
    @Inject(WALLET_LINK_AUTHORIZER) private readonly authorizer: WalletLinkAuthorizer,
    @Inject(PARTY_REGISTRY_READER) private readonly registry: PartyRegistryReader,
    @Inject(WALLET_LINK_SETTINGS) private readonly settings: WalletLinkSettings,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TRANSACTION_TRACKING) private readonly tracker: TransactionTracking,
    private readonly audit: AuditTrail,
  ) {}

  /**
   * ACC-03/04 bước 2: xác minh chữ ký EIP-4361, ghi ví PENDING và cấp giấy phép EIP-712.
   * Ví người dùng dùng giấy phép này để tự gửi registerUser/rotateWallet và tự trả gas.
   */
  async execute(
    user: AuthenticatedUser,
    command: AuthorizeWalletLinkCommand,
    client: ClientContext,
  ): Promise<WalletLinkAuthorization> {
    const contractAddress = this.authorizer.contractAddress;
    if (!contractAddress) {
      throw new IdentityChainNotConfiguredError();
    }
    const claims = await this.verifyChallenge(user, command);
    if (claims.purpose === 'ROTATE') {
      await this.confirmPassword(user.id, command.password);
    }

    const identity = await this.wallets.findIdentity(user.id);
    if (!identity) {
      throw new SessionRequiredError();
    }
    const plan = planWalletBinding(
      await loadPersonalWalletState(identity.wallets, this.tracker),
      claims.address,
      claims.purpose,
    );
    const existing = await this.wallets.findByAddress(claims.address);
    if (existing && existing.id !== plan.reusePendingId) {
      throw new WalletAlreadyUsedError();
    }
    const chainPartyId = partyIdFromUuid(identity.party.id);
    await this.assertChainState(chainPartyId, claims.address, plan.previousAddress);

    const wallet = await this.wallets.savePendingPersonalWallet({
      partyId: identity.party.id,
      address: claims.address,
      reusePendingId: plan.reusePendingId,
      discardPendingId: plan.discardPendingId,
    });
    const binding: WalletBinding = {
      partyId: chainPartyId,
      wallet: toChecksumAddress(claims.address),
      previousWallet: plan.previousAddress ? toChecksumAddress(plan.previousAddress) : ZeroAddress,
      deadline: BigInt(
        Math.floor(this.clock.now().getTime() / 1000) + this.settings.authorizationTtlSeconds,
      ),
    };
    const signature = await this.authorizer.sign(binding);
    const method = bindingMethod(binding);
    await this.audit.record({
      action: AuditAction.WALLET_LINK_AUTHORIZED,
      actorUserId: user.id,
      targetType: 'party_wallet',
      targetId: wallet.id,
      metadata: { address: claims.address, purpose: claims.purpose, method },
      client,
    });

    return {
      walletId: wallet.id,
      method,
      chainId: this.authorizer.chainId,
      contractAddress: toChecksumAddress(contractAddress),
      partyId: chainPartyId,
      wallet: binding.wallet,
      previousWallet: binding.previousWallet,
      deadline: binding.deadline.toString(),
      signature,
    };
  }

  private async verifyChallenge(
    user: AuthenticatedUser,
    command: AuthorizeWalletLinkCommand,
  ): Promise<WalletChallengeClaims> {
    const claims = await this.challenges.verify(command.challengeToken);
    if (!claims || claims.userId !== user.id) {
      throw new WalletChallengeInvalidError();
    }
    let signer: string;
    try {
      signer = verifyMessage(siweMessageFor(claims, this.settings), command.signature);
    } catch {
      throw new WalletSignatureMismatchError();
    }
    if (signer.toLowerCase() !== claims.address) {
      throw new WalletSignatureMismatchError();
    }
    return claims;
  }

  private async confirmPassword(userId: string, password: string | undefined): Promise<void> {
    const account = await this.accounts.findById(userId);
    const confirmed =
      account !== null &&
      password !== undefined &&
      (await this.hasher.verify(account.passwordHash, password));
    if (!confirmed) {
      throw new PasswordConfirmationError();
    }
  }

  /** On-chain là nguồn sự thật: ví chưa từng dùng, và ví hiện tại của Party khớp CSDL. */
  private async assertChainState(
    chainPartyId: string,
    address: string,
    previousAddress: string | null,
  ): Promise<void> {
    let used: boolean;
    let currentWallet: string | null;
    try {
      [used, currentWallet] = await Promise.all([
        this.registry.isWalletUsed(address),
        this.registry.walletOf(chainPartyId),
      ]);
    } catch {
      throw new BlockchainUnavailableError();
    }
    if (used) {
      throw new WalletAlreadyUsedError();
    }
    if (currentWallet !== previousAddress) {
      throw new ChainOutOfSyncError();
    }
  }
}
