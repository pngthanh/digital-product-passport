import { Inject, Injectable } from '@nestjs/common';
import { OWNERSHIP_TRANSFER_CONTRACT_NAME, type TransferState, uuidFromPartyId } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { AnomalyAlerts, AnomalyRule } from '../../audit/index.js';
import type { ChainEvent, EventProjector } from '../../chain-sync/index.js';
import { IdentityDirectory } from '../../identity/index.js';
import { InspectionOwnerChange } from '../../inspection/index.js';
import { Notifier, type NotificationInput } from '../../notifications/index.js';
import { ProductDirectory } from '../../products/index.js';
import { ServiceOwnerChange } from '../../service/index.js';
import {
  TRANSFER_REQUEST_REPOSITORY,
  type TransferRequestRepository,
} from './ports/transfer-request.repository.js';

const CLOSING_STATES: Readonly<Record<string, Exclude<TransferState, 'REQUESTED'>>> = {
  TransferCancelled: 'CANCELLED',
  TransferRejected: 'REJECTED',
  TransferExpired: 'EXPIRED',
  TransferAccepted: 'COMPLETED',
};

function textArg(event: ChainEvent, name: string): string | null {
  const value = event.args[name];
  return typeof value === 'string' ? value : null;
}

function partyUuid(chainPartyId: string | null): string | null {
  if (!chainPartyId) {
    return null;
  }
  try {
    return uuidFromPartyId(chainPartyId);
  } catch {
    return null;
  }
}

/** requestId (uint256) chuẩn hoá thành chuỗi thập phân bởi Indexer. */
function requestIdOf(event: ChainEvent): bigint | null {
  const value = event.args.requestId;
  return typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : null;
}

/**
 * Chiếu event OwnershipTransfer sang transfer_requests (M9). TransferAccepted còn nối dòng
 * ownership_records của cùng giao dịch với yêu cầu, và huỷ yêu cầu bảo hành, kiểm định chưa xử lý của
 * chủ cũ. Đổi owner, custody do ProductPassportProjector chiếu từ OwnershipTransferred.
 */
@Injectable()
export class TransferProjector implements EventProjector {
  readonly contractName = OWNERSHIP_TRANSFER_CONTRACT_NAME;
  readonly eventNames = [
    'TransferRequested',
    'TransferCancelled',
    'TransferRejected',
    'TransferExpired',
    'TransferAccepted',
  ] as const;

  constructor(
    @Inject(TRANSFER_REQUEST_REPOSITORY) private readonly requests: TransferRequestRepository,
    private readonly products: ProductDirectory,
    private readonly identity: IdentityDirectory,
    private readonly service: ServiceOwnerChange,
    private readonly inspection: InspectionOwnerChange,
    private readonly alerts: AnomalyAlerts,
    private readonly notifier: Notifier,
  ) {}

  async project(event: ChainEvent, scope: TransactionScope): Promise<void> {
    if (event.eventName === 'TransferRequested') {
      await this.projectRequested(event, scope);
      return;
    }
    const state = CLOSING_STATES[event.eventName];
    const requestId = requestIdOf(event);
    if (!state || requestId === null) {
      return;
    }
    const closed = await this.requests.close(
      requestId,
      state,
      { at: event.blockTimestamp, txHash: event.txHash },
      scope,
    );
    if (!closed) {
      await this.unknown(event);
      return;
    }
    const outcome: NotificationInput['type'] | null =
      state === 'COMPLETED'
        ? 'TRANSFER_ACCEPTED'
        : state === 'REJECTED'
          ? 'TRANSFER_REJECTED'
          : null;
    const product = outcome ? await this.products.findById(closed.productId) : null;
    if (outcome && product) {
      await this.notifier.notify(
        { type: outcome, recipients: [closed.fromPartyId], product },
        scope,
      );
    }
    if (state === 'COMPLETED') {
      await this.products.linkOwnershipTransfer(
        {
          productId: closed.productId,
          toPartyId: closed.toPartyId,
          txHash: event.txHash,
          transferRequestId: closed.id,
        },
        scope,
      );
      await this.service.onOwnerChanged(
        closed.productId,
        closed.fromPartyId,
        event.blockTimestamp,
        scope,
      );
      await this.inspection.onOwnerChanged(
        closed.productId,
        closed.fromPartyId,
        event.blockTimestamp,
        scope,
      );
    }
  }

  private async projectRequested(event: ChainEvent, scope: TransactionScope): Promise<void> {
    const requestId = requestIdOf(event);
    const chainProductId = textArg(event, 'productId');
    const fromPartyId = partyUuid(textArg(event, 'fromPartyId'));
    const toPartyId = partyUuid(textArg(event, 'toPartyId'));
    const expiresAt = Number(event.args.expiresAt);
    const product = chainProductId
      ? await this.products.findByChainProductId(chainProductId, scope)
      : null;
    const parties =
      fromPartyId && toPartyId
        ? await this.identity.describeParties([fromPartyId, toPartyId])
        : new Map();
    if (
      requestId === null ||
      !product ||
      !fromPartyId ||
      !toPartyId ||
      parties.size !== 2 ||
      !Number.isFinite(expiresAt)
    ) {
      await this.unknown(event, product?.id);
      return;
    }
    const created = await this.requests.create(
      {
        chainRequestId: requestId,
        productId: product.id,
        fromPartyId,
        toPartyId,
        requestedAt: event.blockTimestamp,
        expiresAt: new Date(expiresAt * 1000),
        createdTxHash: event.txHash,
      },
      scope,
    );
    if (created) {
      await this.notifier.notify(
        { type: 'TRANSFER_REQUESTED', recipients: [toPartyId], product },
        scope,
      );
    }
  }

  private async unknown(event: ChainEvent, productId?: string): Promise<void> {
    await this.alerts.raise({
      ruleCode: AnomalyRule.TRANSFER_UNKNOWN,
      severity: 'HIGH',
      ...(productId ? { productId } : {}),
      details: {
        eventName: event.eventName,
        requestId: event.args.requestId ?? null,
        chainProductId: textArg(event, 'productId'),
        txHash: event.txHash,
      },
    });
  }
}
