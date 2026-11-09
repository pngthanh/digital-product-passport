import { Inject, Injectable } from '@nestjs/common';
import {
  decodeChainEnum,
  partyIdFromUuid,
  SERVICE_TICKET_MANAGER_CONTRACT_NAME,
} from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { AnomalyAlerts, AnomalyRule } from '../../audit/index.js';
import type { ChainEvent, EventProjector } from '../../chain-sync/index.js';
import { ProductDirectory } from '../../products/index.js';
import { requestIdOf, type ServiceRequestRecord } from '../domain/service-request.js';
import {
  SERVICE_REQUEST_REPOSITORY,
  type ServiceRequestRepository,
} from './ports/service-request.repository.js';

function textArg(event: ChainEvent, name: string): string | null {
  const value = event.args[name];
  return typeof value === 'string' ? value : null;
}

/** Kết quả đóng phiếu từ enum ServiceTicketState on-chain; giá trị khác là dữ liệu lạ. */
function closedState(value: unknown): 'REPAIRED' | 'REJECTED' | null {
  if (typeof value !== 'number') {
    return null;
  }
  try {
    const state = decodeChainEnum('ServiceTicketState', value);
    return state === 'REPAIRED' || state === 'REJECTED' ? state : null;
  } catch {
    return null;
  }
}

/**
 * Chiếu event ServiceTicketManager sang service_requests và service_records (M7). Mở phiếu: REQUESTED
 * thành IN_REPAIR, ghi còn hay hết bảo hành. Đóng phiếu: REPAIRED hoặc REJECTED, biên bản có đúng
 * hash on-chain thành CONFIRMED. Tạm dừng, tiếp tục bảo hành do WarrantyManagerProjector chiếu.
 */
@Injectable()
export class ServiceTicketProjector implements EventProjector {
  readonly contractName = SERVICE_TICKET_MANAGER_CONTRACT_NAME;
  readonly eventNames = ['ServiceTicketOpened', 'ServiceTicketClosed'] as const;

  constructor(
    @Inject(SERVICE_REQUEST_REPOSITORY) private readonly requests: ServiceRequestRepository,
    private readonly products: ProductDirectory,
    private readonly alerts: AnomalyAlerts,
  ) {}

  async project(event: ChainEvent, scope: TransactionScope): Promise<void> {
    const request = await this.matchingRequest(event, scope);
    if (!request) {
      await this.alerts.raise({
        ruleCode: AnomalyRule.SERVICE_TICKET_UNKNOWN,
        severity: 'HIGH',
        details: {
          ticketId: textArg(event, 'ticketId'),
          chainProductId: textArg(event, 'productId'),
          eventName: event.eventName,
          txHash: event.txHash,
        },
      });
      return;
    }
    if (event.eventName === 'ServiceTicketOpened') {
      await this.opened(event, request, scope);
    } else {
      await this.closed(event, request, scope);
    }
  }

  /** Yêu cầu có id suy ra từ ticketId, đúng sản phẩm và (khi mở phiếu) đúng trung tâm trong event. */
  private async matchingRequest(
    event: ChainEvent,
    scope: TransactionScope,
  ): Promise<ServiceRequestRecord | null> {
    const ticketId = textArg(event, 'ticketId');
    const chainProductId = textArg(event, 'productId');
    const requestId = ticketId ? requestIdOf(ticketId) : null;
    if (!requestId || !chainProductId) {
      return null;
    }
    const [request, product] = await Promise.all([
      this.requests.findById(requestId, scope),
      this.products.findByChainProductId(chainProductId, scope),
    ]);
    if (!request || !product || product.id !== request.productId) {
      return null;
    }
    const center = textArg(event, 'serviceCenterId');
    if (
      event.eventName === 'ServiceTicketOpened' &&
      center !== partyIdFromUuid(request.serviceCenterOrgId)
    ) {
      return null;
    }
    return request;
  }

  private async opened(
    event: ChainEvent,
    request: ServiceRequestRecord,
    scope: TransactionScope,
  ): Promise<void> {
    if (request.serviceState === 'CANCELLED') {
      // Chủ sở hữu huỷ đúng lúc trung tâm mở phiếu: chain là nguồn sự thật, phiếu vẫn mở. Yêu cầu
      // mới hơn của sản phẩm (nếu có) không mở được nữa nên huỷ theo.
      const cancelled = await this.requests.cancelOtherRequests(
        request.productId,
        request.id,
        event.blockTimestamp,
        scope,
      );
      await this.alerts.raise({
        ruleCode: AnomalyRule.SERVICE_TICKET_CONFLICT,
        severity: 'LOW',
        productId: request.productId,
        details: { requestId: request.id, cancelledRequests: cancelled, txHash: event.txHash },
      });
    }
    await this.requests.markOpened(
      {
        requestId: request.id,
        chainTicketId: textArg(event, 'ticketId') ?? '',
        warrantyCovered: event.args.warrantyCovered === true,
        openedAt: event.blockTimestamp,
        openTxHash: event.txHash,
      },
      scope,
    );
  }

  private async closed(
    event: ChainEvent,
    request: ServiceRequestRecord,
    scope: TransactionScope,
  ): Promise<void> {
    const state = closedState(event.args.state);
    const evidenceHash = textArg(event, 'evidenceHash');
    if (!state || !evidenceHash) {
      await this.alerts.raise({
        ruleCode: AnomalyRule.SERVICE_TICKET_UNKNOWN,
        severity: 'HIGH',
        productId: request.productId,
        details: { requestId: request.id, eventName: event.eventName, txHash: event.txHash },
      });
      return;
    }
    await this.requests.markClosed(
      {
        requestId: request.id,
        state,
        closedAt: event.blockTimestamp,
        closeTxHash: event.txHash,
      },
      scope,
    );
    const confirmed = await this.requests.confirmRecord(
      request.id,
      evidenceHash,
      { txHash: event.txHash, recordedAt: event.blockTimestamp },
      scope,
    );
    if (!confirmed) {
      await this.alerts.raise({
        ruleCode: AnomalyRule.SERVICE_EVIDENCE_MISMATCH,
        severity: 'HIGH',
        productId: request.productId,
        details: { requestId: request.id, evidenceHash, txHash: event.txHash },
      });
    }
  }
}
