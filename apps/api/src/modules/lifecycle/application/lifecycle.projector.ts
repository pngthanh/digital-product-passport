import { Inject, Injectable } from '@nestjs/common';
import { PRODUCT_LIFECYCLE_CONTRACT_NAME } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { AnomalyAlerts, AnomalyRule, AuditAction, AuditTrail } from '../../audit/index.js';
import type { ChainEvent, EventProjector } from '../../chain-sync/index.js';
import { InspectionOwnerChange } from '../../inspection/index.js';
import { Notifier } from '../../notifications/index.js';
import { ProductDirectory, type ProductRef } from '../../products/index.js';
import { ServiceOwnerChange } from '../../service/index.js';
import { RECALL_REPOSITORY, type RecallRepository } from './ports/recall.repository.js';

/** Lý do lưu khi chain có thu hồi mà hệ thống không có nội dung khớp hash (đã cảnh báo). */
export const UNKNOWN_RECALL_REASON =
  'Nhà sản xuất thu hồi trên blockchain nhưng hệ thống không có nội dung lý do khớp với hash đã ghi.';

function auditActionOf(eventName: string): AuditAction | null {
  switch (eventName) {
    case 'ProductRecalled':
      return AuditAction.PRODUCT_RECALLED;
    case 'ProductReportedLostStolen':
      return AuditAction.PRODUCT_REPORTED_LOST_STOLEN;
    case 'ProductRetired':
      return AuditAction.PRODUCT_RETIRED;
    default:
      return null;
  }
}

function textArg(event: ChainEvent, name: string): string | null {
  const value = event.args[name];
  return typeof value === 'string' ? value : null;
}

/**
 * Chiếu event ProductLifecycle (M10). Trạng thái sản phẩm do ProductPassportProjector chiếu từ
 * ProductStateChanged phát ngay sau trong cùng giao dịch; ở đây: chốt lý do thu hồi (recalls), báo
 * chủ sở hữu và nhà bán lẻ đang giữ hoặc sắp nhận hàng, huỷ yêu cầu bảo hành, kiểm định đang chờ.
 * ProductRecalled phát trước khi đổi trạng thái nên CSDL còn đúng bên giữ hàng lúc thu hồi.
 */
@Injectable()
export class LifecycleProjector implements EventProjector {
  readonly contractName = PRODUCT_LIFECYCLE_CONTRACT_NAME;
  readonly eventNames = ['ProductRecalled', 'ProductReportedLostStolen', 'ProductRetired'] as const;

  constructor(
    @Inject(RECALL_REPOSITORY) private readonly recalls: RecallRepository,
    private readonly products: ProductDirectory,
    @Inject(ServiceOwnerChange)
    private readonly service: Pick<ServiceOwnerChange, 'onProductClosed'>,
    @Inject(InspectionOwnerChange)
    private readonly inspection: Pick<InspectionOwnerChange, 'onProductClosed'>,
    private readonly notifier: Notifier,
    private readonly alerts: AnomalyAlerts,
    private readonly audit: AuditTrail,
  ) {}

  async project(event: ChainEvent, scope: TransactionScope): Promise<void> {
    const chainProductId = textArg(event, 'productId');
    const product = chainProductId
      ? await this.products.findByChainProductId(chainProductId, scope)
      : null;
    if (!product) {
      await this.alerts.raise({
        ruleCode: AnomalyRule.PRODUCT_NOT_IN_DATABASE,
        severity: 'HIGH',
        details: { chainProductId, eventName: event.eventName, txHash: event.txHash },
      });
      return;
    }
    if (event.eventName === 'ProductRecalled') {
      await this.recalled(event, product, scope);
    }
    await this.service.onProductClosed(product.id, event.blockTimestamp, scope);
    await this.inspection.onProductClosed(product.id, event.blockTimestamp, scope);
    const action = auditActionOf(event.eventName);
    if (action) {
      await this.audit.record(
        {
          action,
          actorUserId: null,
          targetType: 'product',
          targetId: product.id,
          metadata: {
            serialNumber: product.serialNumber,
            txHash: event.txHash,
            actorAddress: event.actorAddress,
          },
        },
        scope,
      );
    }
  }

  private async recalled(
    event: ChainEvent,
    product: ProductRef,
    scope: TransactionScope,
  ): Promise<void> {
    const reasonHash = textArg(event, 'reasonHash') ?? '';
    const chain = { txHash: event.txHash, at: event.blockTimestamp };
    if (!(await this.recalls.confirm(product.id, reasonHash, chain, scope))) {
      await this.recalls.confirmWithoutReason(
        {
          productId: product.id,
          issuerOrgId: product.issuerOrgId,
          reasonHash,
          reason: UNKNOWN_RECALL_REASON,
        },
        chain,
        scope,
      );
      await this.alerts.raise({
        ruleCode: AnomalyRule.RECALL_REASON_MISMATCH,
        severity: 'HIGH',
        productId: product.id,
        details: { reasonHash, txHash: event.txHash },
      });
    }
    const recall = await this.recalls.findByProduct(product.id, scope);
    // Nhà sản xuất tự giữ hàng thì không cần báo chính mình.
    const holder =
      product.currentCustodianPartyId === product.issuerOrgId
        ? null
        : product.currentCustodianPartyId;
    await this.notifier.notify(
      {
        type: 'PRODUCT_RECALLED',
        recipients: [product.currentOwnerPartyId, holder, product.pendingCustodianPartyId],
        product,
        organizationId: product.issuerOrgId,
        reason: recall?.reason ?? null,
      },
      scope,
    );
  }
}
