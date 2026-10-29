import { Inject, Injectable } from '@nestjs/common';
import {
  decodeChainEnum,
  PRODUCT_PASSPORT_CONTRACT_NAME,
  partyIdFromUuid,
  type ProductState,
} from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { AnomalyAlerts, AnomalyRule, AuditAction, AuditTrail } from '../../audit/index.js';
import type { ChainEvent, EventProjector } from '../../chain-sync/index.js';
import { IdentityDirectory } from '../../identity/index.js';
import { isDraft, type ProductRecord } from '../domain/product.js';
import { partyUuidOf } from './party-labels.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';

type LifecycleState = Extract<ProductState, 'RECALLED' | 'LOST_STOLEN' | 'RETIRED'>;

/** Trạng thái do contract vòng đời (M10) đặt qua `setLifecycleState`. */
function isLifecycleState(state: ProductState | null): state is LifecycleState {
  return state === 'RECALLED' || state === 'LOST_STOLEN' || state === 'RETIRED';
}

/**
 * Chiếu event của ProductPassport (đã finalized) sang products (cột [P]), custody_records và
 * ownership_records. Mỗi bước giao nhận/bán cập nhật trạng thái và các bên trong một lệnh để luôn
 * thoả CHECK của bảng products; ProductStateChanged phát sau cùng dùng để đối chiếu (và áp dụng
 * trạng thái vòng đời của M10). Lệch thì không sửa bừa mà tạo cảnh báo.
 */
@Injectable()
export class ProductPassportProjector implements EventProjector {
  readonly contractName = PRODUCT_PASSPORT_CONTRACT_NAME;
  readonly eventNames = [
    'ProductRegistered',
    'CustodyHandoverInitiated',
    'CustodyHandoverCancelled',
    'CustodyHandoverRejected',
    'CustodyTransferred',
    'OwnershipTransferred',
    'ProductStateChanged',
  ] as const;

  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly identity: IdentityDirectory,
    private readonly alerts: AnomalyAlerts,
    private readonly audit: AuditTrail,
  ) {}

  async project(event: ChainEvent, scope: TransactionScope): Promise<void> {
    if (event.eventName === 'ProductRegistered') {
      await this.projectRegistered(event, scope);
      return;
    }
    const product = await this.registeredProduct(event, scope);
    if (!product) {
      return;
    }
    switch (event.eventName) {
      case 'CustodyHandoverInitiated': {
        const retailer = await this.knownParty(event, 'toPartyId', product);
        if (retailer) {
          await this.products.markDispatched(product.id, retailer, scope);
        }
        return;
      }
      case 'CustodyHandoverCancelled':
      case 'CustodyHandoverRejected':
        // Thu hồi (M10) hàng đang giao cũng phát CustodyHandoverCancelled trước ProductStateChanged.
        await this.products.markHandoverClosed(product.id, scope);
        return;
      case 'CustodyTransferred':
        await this.projectCustody(event, product, scope);
        return;
      case 'OwnershipTransferred':
        await this.projectOwnership(event, product, scope);
        return;
      case 'ProductStateChanged':
        await this.projectStateChanged(event, product, scope);
        return;
      default:
        return;
    }
  }

  private async projectRegistered(event: ChainEvent, scope: TransactionScope): Promise<void> {
    const chainProductId = stringArg(event, 'productId');
    const issuerId = stringArg(event, 'issuerId');
    const metadataHash = stringArg(event, 'metadataHash');
    const warrantyMonths = event.args.warrantyMonths;
    const product = await this.products.findByChainProductId(chainProductId, scope);
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
      metadataHash !== product.metadataHash ||
      warrantyMonths !== product.warrantyMonths
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
          onchainWarrantyMonths: typeof warrantyMonths === 'number' ? warrantyMonths : null,
          databaseWarrantyMonths: product.warrantyMonths,
          txHash: event.txHash,
        },
      });
      return;
    }
    // Party của nhà sản xuất dùng chung UUID với dòng organizations (D25): bên giữ hàng đầu tiên.
    await this.products.markRegistered(
      product.id,
      { issuerPartyId: product.issuerOrgId, txHash: event.txHash, at: event.blockTimestamp },
      scope,
    );
    await this.products.recordCustody(
      {
        productId: product.id,
        fromPartyId: null,
        toPartyId: product.issuerOrgId,
        eventId: requireEventId(event),
        at: event.blockTimestamp,
      },
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

  /**
   * DST-02 (nhà bán lẻ được giao nhận hàng): AT_RETAIL. Ở bước bán (DST-03) hay chuyển nhượng (M9),
   * OwnershipTransferred đã chiếu trước nên chỉ đổi bên giữ hàng.
   */
  private async projectCustody(
    event: ChainEvent,
    product: ProductRecord,
    scope: TransactionScope,
  ): Promise<void> {
    const to = await this.knownParty(event, 'toPartyId', product);
    if (!to) {
      return;
    }
    const from = partyUuidOf(stringArg(event, 'fromPartyId'));
    if (product.productState === 'IN_DISTRIBUTION' && product.pendingCustodianPartyId === to) {
      await this.products.markReceived(product.id, to, scope);
    } else {
      await this.products.setCustodian(product.id, to, scope);
    }
    await this.products.recordCustody(
      {
        productId: product.id,
        fromPartyId: from,
        toPartyId: to,
        eventId: requireEventId(event),
        at: event.blockTimestamp,
      },
      scope,
    );
  }

  /** DST-03: lần bán đầu (bên giao rỗng) thì SOLD và người mua thành chủ; M9 chỉ đổi chủ. */
  private async projectOwnership(
    event: ChainEvent,
    product: ProductRecord,
    scope: TransactionScope,
  ): Promise<void> {
    const to = await this.knownParty(event, 'toPartyId', product);
    if (!to) {
      return;
    }
    const from = partyUuidOf(stringArg(event, 'fromPartyId'));
    if (from === null) {
      await this.products.markSold(product.id, to, scope);
      await this.audit.record(
        {
          action: AuditAction.PRODUCT_SOLD,
          actorUserId: null,
          targetType: 'product',
          targetId: product.id,
          metadata: {
            serialNumber: product.serialNumber,
            retailerPartyId: product.currentCustodianPartyId,
            txHash: event.txHash,
          },
        },
        scope,
      );
    } else {
      await this.products.setOwner(product.id, to, scope);
    }
    await this.products.recordOwnership(
      {
        productId: product.id,
        fromPartyId: from,
        toPartyId: to,
        eventId: requireEventId(event),
        at: event.blockTimestamp,
      },
      scope,
    );
  }

  /** Trạng thái vòng đời (M10) áp dụng tại đây; các trạng thái khác phải khớp bước vừa chiếu. */
  private async projectStateChanged(
    event: ChainEvent,
    product: ProductRecord,
    scope: TransactionScope,
  ): Promise<void> {
    const ordinal = event.args.newState;
    const next = typeof ordinal === 'number' ? decodeChainEnum('ProductState', ordinal) : null;
    if (isLifecycleState(next)) {
      await this.products.setLifecycleState(product.id, next, scope);
      return;
    }
    if (next !== product.productState) {
      await this.alerts.raise({
        ruleCode: AnomalyRule.PRODUCT_STATE_MISMATCH,
        severity: 'HIGH',
        productId: product.id,
        details: {
          onchainState: next,
          databaseState: product.productState,
          txHash: event.txHash,
        },
      });
    }
  }

  /** Sản phẩm đã CONFIRMED trong CSDL; không có thì cảnh báo và bỏ qua event. */
  private async registeredProduct(
    event: ChainEvent,
    scope: TransactionScope,
  ): Promise<ProductRecord | null> {
    const chainProductId = stringArg(event, 'productId');
    const product = await this.products.findByChainProductId(chainProductId, scope);
    if (product && !isDraft(product)) {
      return product;
    }
    await this.alerts.raise({
      ruleCode: AnomalyRule.PRODUCT_NOT_IN_DATABASE,
      severity: 'HIGH',
      ...(product ? { productId: product.id } : {}),
      details: { chainProductId, eventName: event.eventName, txHash: event.txHash },
    });
    return null;
  }

  /** UUID Party trong tham số `name`; Party không có trong CSDL thì cảnh báo và trả `null`. */
  private async knownParty(
    event: ChainEvent,
    name: string,
    product: ProductRecord,
  ): Promise<string | null> {
    const chainPartyId = stringArg(event, name);
    const partyId = partyUuidOf(chainPartyId);
    const known = partyId ? (await this.identity.describeParties([partyId])).has(partyId) : false;
    if (partyId && known) {
      return partyId;
    }
    await this.alerts.raise({
      ruleCode: AnomalyRule.PRODUCT_PARTY_UNKNOWN,
      severity: 'HIGH',
      productId: product.id,
      details: { chainPartyId, eventName: event.eventName, txHash: event.txHash },
    });
    return null;
  }
}

function stringArg(event: ChainEvent, name: string): string {
  const value = event.args[name];
  if (typeof value !== 'string') {
    throw new Error(`Event ${event.eventName} thiếu tham số ${name}`);
  }
  return value;
}

function requireEventId(event: ChainEvent): string {
  if (!event.eventId) {
    throw new Error(`Thiếu id blockchain_events của ${event.eventName} (tx ${event.txHash})`);
  }
  return event.eventId;
}
