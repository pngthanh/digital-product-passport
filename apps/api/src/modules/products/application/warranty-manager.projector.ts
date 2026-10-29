import { Inject, Injectable } from '@nestjs/common';
import { WARRANTY_MANAGER_CONTRACT_NAME } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { AnomalyAlerts, AnomalyRule } from '../../audit/index.js';
import type { ChainEvent, EventProjector } from '../../chain-sync/index.js';
import { IdentityDirectory } from '../../identity/index.js';
import { isDraft } from '../domain/product.js';
import { partyUuidOf } from './party-labels.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';

/** uint64 lớn hơn 48 bit được Indexer lưu dạng chuỗi thập phân (giây Unix). */
function secondsArg(event: ChainEvent, name: string): Date {
  const value = event.args[name];
  const seconds = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  if (!Number.isSafeInteger(seconds)) {
    throw new Error(`Event ${event.eventName} thiếu tham số ${name}`);
  }
  return new Date(seconds * 1000);
}

/**
 * Chiếu event WarrantyManager sang warranties: kích hoạt khi bán (DST-03), tạm dừng và tiếp tục
 * (M7). Hết hạn không có event; job đồng bộ cột warranty_state và màn hình tự tính theo giờ (D10).
 */
@Injectable()
export class WarrantyManagerProjector implements EventProjector {
  readonly contractName = WARRANTY_MANAGER_CONTRACT_NAME;
  readonly eventNames = ['WarrantyActivated', 'WarrantySuspended', 'WarrantyResumed'] as const;

  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly identity: IdentityDirectory,
    private readonly alerts: AnomalyAlerts,
  ) {}

  async project(event: ChainEvent, scope: TransactionScope): Promise<void> {
    const chainProductId = event.args.productId;
    const product =
      typeof chainProductId === 'string'
        ? await this.products.findByChainProductId(chainProductId, scope)
        : null;
    if (!product || isDraft(product)) {
      await this.alerts.raise({
        ruleCode: AnomalyRule.PRODUCT_NOT_IN_DATABASE,
        severity: 'HIGH',
        details: {
          chainProductId: typeof chainProductId === 'string' ? chainProductId : null,
          eventName: event.eventName,
          txHash: event.txHash,
        },
      });
      return;
    }
    if (event.eventName === 'WarrantySuspended' || event.eventName === 'WarrantyResumed') {
      await this.products.setWarrantySuspended(
        product.id,
        event.eventName === 'WarrantySuspended',
        scope,
      );
      return;
    }

    const activatedBy =
      typeof event.args.activatedBy === 'string' ? partyUuidOf(event.args.activatedBy) : null;
    const known =
      activatedBy !== null && (await this.identity.describeParties([activatedBy])).has(activatedBy);
    if (!activatedBy || !known) {
      await this.alerts.raise({
        ruleCode: AnomalyRule.PRODUCT_PARTY_UNKNOWN,
        severity: 'HIGH',
        productId: product.id,
        details: { eventName: event.eventName, txHash: event.txHash },
      });
      return;
    }
    await this.products.activateWarranty(
      {
        productId: product.id,
        activatedByPartyId: activatedBy,
        activatedAt: secondsArg(event, 'activatedAt'),
        expiresAt: secondsArg(event, 'expiresAt'),
        warrantyState: 'ACTIVE',
        activationTxHash: event.txHash,
      },
      scope,
    );
  }
}
