import { Inject, Injectable } from '@nestjs/common';
import { PRODUCT_PASSPORT_CONTRACT_NAME, partyIdFromUuid } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { AnomalyAlerts, AnomalyRule, AuditAction, AuditTrail } from '../../audit/index.js';
import type { ChainEvent, EventProjector } from '../../chain-sync/index.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';

/**
 * Chiếu ProductRegistered (đã finalized) sang products (cột [P]) và custody_records. Hồ sơ CSDL
 * phải khớp hash và nhà phát hành on-chain; lệch thì không công bố hộ chiếu và tạo cảnh báo.
 */
@Injectable()
export class ProductPassportProjector implements EventProjector {
  readonly contractName = PRODUCT_PASSPORT_CONTRACT_NAME;
  readonly eventNames = ['ProductRegistered'] as const;

  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly alerts: AnomalyAlerts,
    private readonly audit: AuditTrail,
  ) {}

  async project(event: ChainEvent, scope: TransactionScope): Promise<void> {
    const chainProductId = stringArg(event, 'productId');
    const issuerId = stringArg(event, 'issuerId');
    const metadataHash = stringArg(event, 'metadataHash');
    const product = await this.products.findByChainProductId(chainProductId);
    if (!product) {
      await this.alerts.raise({
        ruleCode: AnomalyRule.PRODUCT_NOT_IN_DATABASE,
        severity: 'HIGH',
        details: { chainProductId, issuerId, txHash: event.txHash },
      });
      return;
    }
    if (
      issuerId !== partyIdFromUuid(product.issuerOrgId) ||
      metadataHash !== product.metadataHash
    ) {
      await this.products.markFailed(product.id, scope);
      await this.alerts.raise({
        ruleCode: AnomalyRule.PRODUCT_METADATA_MISMATCH,
        severity: 'HIGH',
        productId: product.id,
        details: {
          chainProductId,
          onchainIssuer: issuerId,
          onchainMetadataHash: metadataHash,
          databaseMetadataHash: product.metadataHash,
          txHash: event.txHash,
        },
      });
      return;
    }
    if (!event.eventId) {
      throw new Error(`Thiếu id blockchain_events của ProductRegistered (tx ${event.txHash})`);
    }
    // Party của nhà sản xuất dùng chung UUID với dòng organizations (D25): bên giữ hàng đầu tiên.
    await this.products.markRegistered(
      product.id,
      { issuerPartyId: product.issuerOrgId, txHash: event.txHash, at: event.blockTimestamp },
      scope,
    );
    await this.products.recordCustody(
      product.id,
      product.issuerOrgId,
      event.eventId,
      event.blockTimestamp,
      scope,
    );
    await this.audit.record(
      {
        action: AuditAction.PRODUCT_REGISTERED,
        actorUserId: null,
        targetType: 'product',
        targetId: product.id,
        metadata: {
          serialNumber: product.serialNumber,
          txHash: event.txHash,
          blockNumber: event.blockNumber.toString(),
          actorAddress: event.actorAddress,
        },
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
