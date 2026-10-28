import { Inject, Injectable, Logger } from '@nestjs/common';
import { decodeChainEnum, PARTY_REGISTRY_CONTRACT_NAME, uuidFromPartyId } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import type { ChainEvent, EventProjector } from '../../chain-sync/index.js';
import {
  PARTY_WALLET_REPOSITORY,
  type PartyWalletRepository,
  type ProjectionResult,
} from './ports/party-wallet.repository.js';

/**
 * Chiếu event finalized của PartyRegistry sang các cột [P]: parties.chain_party_id,
 * party_wallets.status/activated_at/revoked_at/link_tx_hash. On-chain là nguồn sự thật.
 */
@Injectable()
export class PartyRegistryProjector implements EventProjector {
  readonly contractName = PARTY_REGISTRY_CONTRACT_NAME;
  readonly eventNames = ['PartyRegistered', 'WalletRotated'] as const;
  private readonly logger = new Logger(PartyRegistryProjector.name);

  constructor(
    @Inject(PARTY_WALLET_REPOSITORY) private readonly wallets: PartyWalletRepository,
    private readonly audit: AuditTrail,
  ) {}

  async project(event: ChainEvent, scope: TransactionScope): Promise<void> {
    const chainPartyId = stringArg(event, 'partyId');
    let partyId: string;
    try {
      partyId = uuidFromPartyId(chainPartyId);
    } catch {
      this.logger.warn(`Bỏ qua ${event.eventName}: partyId ${chainPartyId} không do hệ thống cấp`);
      return;
    }

    if (event.eventName === 'PartyRegistered') {
      // Party tổ chức đăng ký qua luồng riêng ở M4.
      if (decodeChainEnum('PartyKind', Number(event.args.kind)) !== 'USER') {
        return;
      }
      const result = await this.wallets.applyRegistration(
        {
          partyId,
          chainPartyId,
          address: stringArg(event, 'wallet'),
          txHash: event.txHash,
          activatedAt: event.blockTimestamp,
        },
        scope,
      );
      await this.recordAudit(AuditAction.WALLET_ACTIVATED, result, event, scope);
      return;
    }

    const result = await this.wallets.applyRotation(
      {
        partyId,
        previousAddress: stringArg(event, 'previousWallet'),
        newAddress: stringArg(event, 'newWallet'),
        txHash: event.txHash,
        rotatedAt: event.blockTimestamp,
      },
      scope,
    );
    await this.recordAudit(AuditAction.WALLET_ROTATED, result, event, scope);
  }

  private async recordAudit(
    action: AuditAction,
    result: ProjectionResult | null,
    event: ChainEvent,
    scope: TransactionScope,
  ): Promise<void> {
    if (!result) {
      this.logger.warn(`${event.eventName} của Party chưa có trong CSDL (tx ${event.txHash})`);
      return;
    }
    await this.audit.record(
      {
        action,
        actorUserId: result.userId,
        targetType: 'party_wallet',
        targetId: result.walletId,
        metadata: { txHash: event.txHash, blockNumber: event.blockNumber.toString() },
      },
      scope,
    );
  }
}

function stringArg(event: ChainEvent, name: string): string {
  const value = event.args[name];
  if (typeof value !== 'string') {
    throw new Error(`Event ${event.eventName} thiếu tham số ${name}`);
  }
  return value;
}
