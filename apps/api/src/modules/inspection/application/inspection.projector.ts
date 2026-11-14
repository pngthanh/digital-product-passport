import { Inject, Injectable } from '@nestjs/common';
import { decodeChainEnum, INSPECTION_REGISTRY_CONTRACT_NAME, partyIdFromUuid } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { AnomalyAlerts, AnomalyRule } from '../../audit/index.js';
import type { ChainEvent, EventProjector } from '../../chain-sync/index.js';
import { Notifier } from '../../notifications/index.js';
import { ProductDirectory, type ProductRef } from '../../products/index.js';
import { type InspectionRequestRecord, requestIdOf } from '../domain/inspection-request.js';
import {
  INSPECTION_REQUEST_REPOSITORY,
  type InspectionRequestRepository,
} from './ports/inspection-request.repository.js';

function textArg(event: ChainEvent, name: string): string | null {
  const value = event.args[name];
  return typeof value === 'string' ? value : null;
}

/** Kết quả hợp lệ từ enum InspectionResult on-chain; NONE hay giá trị lạ trả `null`. */
function resultOf(value: unknown): string | null {
  if (typeof value !== 'number') {
    return null;
  }
  try {
    return decodeChainEnum('InspectionResult', value);
  } catch {
    return null;
  }
}

/**
 * Chiếu InspectionRecorded sang inspection_requests và inspections (M8): yêu cầu thành COMPLETED,
 * biên bản có đúng hash on-chain thành CONFIRMED. Event không khớp yêu cầu, hoặc hash không khớp
 * biên bản nào đã lưu thì tạo cảnh báo.
 */
@Injectable()
export class InspectionProjector implements EventProjector {
  readonly contractName = INSPECTION_REGISTRY_CONTRACT_NAME;
  readonly eventNames = ['InspectionRecorded'] as const;

  constructor(
    @Inject(INSPECTION_REQUEST_REPOSITORY) private readonly requests: InspectionRequestRepository,
    private readonly products: ProductDirectory,
    private readonly alerts: AnomalyAlerts,
    private readonly notifier: Notifier,
  ) {}

  async project(event: ChainEvent, scope: TransactionScope): Promise<void> {
    const matched = await this.matchingRequest(event, scope);
    const request = matched?.request;
    const reportHash = textArg(event, 'reportHash');
    const result = resultOf(event.args.result);
    if (!matched || !request || !reportHash || !result) {
      await this.alerts.raise({
        ruleCode: AnomalyRule.INSPECTION_UNKNOWN,
        severity: 'HIGH',
        productId: request?.productId,
        details: {
          inspectionId: textArg(event, 'inspectionId'),
          chainProductId: textArg(event, 'productId'),
          txHash: event.txHash,
        },
      });
      return;
    }
    if (request.requestState === 'CANCELLED' || request.requestState === 'DECLINED') {
      // Người gửi huỷ hoặc đơn vị từ chối đúng lúc giao dịch đang chờ: chain là nguồn sự thật.
      await this.alerts.raise({
        ruleCode: AnomalyRule.INSPECTION_CONFLICT,
        severity: 'LOW',
        productId: request.productId,
        details: {
          requestId: request.id,
          previousState: request.requestState,
          txHash: event.txHash,
        },
      });
    }
    await this.requests.markCompleted(request.id, event.blockTimestamp, scope);
    const confirmed = await this.requests.confirmInspection(
      request.id,
      reportHash,
      {
        chainInspectionId: textArg(event, 'inspectionId') ?? '',
        txHash: event.txHash,
        inspectedAt: event.blockTimestamp,
      },
      scope,
    );
    if (!confirmed) {
      await this.alerts.raise({
        ruleCode: AnomalyRule.INSPECTION_REPORT_MISMATCH,
        severity: 'HIGH',
        productId: request.productId,
        details: { requestId: request.id, reportHash, txHash: event.txHash },
      });
    }
    await this.notifier.notify(
      {
        type: 'INSPECTION_RECORDED',
        recipients: [request.requestedByPartyId],
        product: matched.product,
        organizationId: request.inspectorOrgId,
        result,
      },
      scope,
    );
  }

  /** Yêu cầu có id suy ra từ inspectionId, đúng sản phẩm và đúng đơn vị kiểm định trong event. */
  private async matchingRequest(
    event: ChainEvent,
    scope: TransactionScope,
  ): Promise<{ request: InspectionRequestRecord; product: ProductRef } | null> {
    const inspectionId = textArg(event, 'inspectionId');
    const chainProductId = textArg(event, 'productId');
    const requestId = inspectionId ? requestIdOf(inspectionId) : null;
    if (!requestId || !chainProductId) {
      return null;
    }
    const [request, product] = await Promise.all([
      this.requests.findById(requestId, scope),
      this.products.findByChainProductId(chainProductId, scope),
    ]);
    if (
      !request ||
      !product ||
      product.id !== request.productId ||
      textArg(event, 'inspectorId') !== partyIdFromUuid(request.inspectorOrgId)
    ) {
      return null;
    }
    return { request, product };
  }
}
