import { Inject, Injectable } from '@nestjs/common';
import {
  type MyTransfers,
  normalizeBytes32,
  OWNERSHIP_TRANSFER_CONTRACT_NAME,
  OWNERSHIP_TRANSFER_METHODS,
  type TrackedTransactionView,
  type TransferFilter,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { TRANSACTION_TRACKING, type TransactionTracking } from '../../chain-sync/index.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import { OwnerParties } from '../../products/index.js';
import { TransferWalletRequiredError } from '../domain/transfer.errors.js';
import { transferContractInfo } from './owner-transfer.use-cases.js';
import { TRANSFER_CHAIN, type TransferChain } from './ports/transfer-chain.port.js';
import {
  TRANSFER_REQUEST_REPOSITORY,
  type TransferRequestRepository,
} from './ports/transfer-request.repository.js';
import { TransferViews } from './transfer-views.js';

export interface TransferListQueryInput {
  filter: TransferFilter;
  page: number;
  pageSize: number;
}

/** TRF-06: yêu cầu gửi tới, đã gửi và đã đóng của người dùng (cùng tổ chức họ đại diện). */
@Injectable()
export class ListMyTransfers {
  constructor(
    @Inject(TRANSFER_REQUEST_REPOSITORY) private readonly requests: TransferRequestRepository,
    @Inject(TRANSFER_CHAIN) private readonly chain: TransferChain,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly owners: OwnerParties,
    private readonly views: TransferViews,
  ) {}

  async execute(user: AuthenticatedUser, query: TransferListQueryInput): Promise<MyTransfers> {
    const { actor, partyIds } = await this.owners.of(user.id);
    const base = {
      contract: transferContractInfo(this.chain),
      wallet: actor?.activeWallet ?? null,
      page: query.page,
      pageSize: query.pageSize,
    };
    if (partyIds.length === 0) {
      return { ...base, items: [], total: 0, counts: { INCOMING: 0, OUTGOING: 0, CLOSED: 0 } };
    }
    const [{ items, total }, counts] = await Promise.all([
      this.requests.listForParties({ partyIds, ...query }),
      this.requests.countsForParties(partyIds),
    ]);
    return {
      ...base,
      items: await this.views.present(items, partyIds, this.clock.now()),
      total,
      counts,
    };
  }
}

/**
 * Web báo txHash sau khi ví gửi một hàm của OwnershipTransfer. API kiểm tra đúng ví, đúng contract,
 * đúng hàm rồi theo dõi tới khi finalized; Indexer vẫn chiếu nếu web không kịp báo.
 */
@Injectable()
export class RecordTransferTransaction {
  constructor(
    @Inject(TRANSACTION_TRACKING) private readonly tracker: TransactionTracking,
    private readonly owners: OwnerParties,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    txHash: string,
    client: ClientContext,
  ): Promise<TrackedTransactionView> {
    const { actor } = await this.owners.of(user.id);
    if (!actor?.activeWallet) {
      throw new TransferWalletRequiredError();
    }
    const normalizedHash = normalizeBytes32(txHash);
    const status = await this.tracker.track({
      txHash: normalizedHash,
      contractName: OWNERSHIP_TRANSFER_CONTRACT_NAME,
      expectedFrom: actor.activeWallet,
      expectedMethods: [...OWNERSHIP_TRANSFER_METHODS],
      initiatedByUserId: user.id,
    });
    await this.audit.record({
      action: AuditAction.TRANSFER_TRANSACTION_SUBMITTED,
      actorUserId: user.id,
      targetType: 'party',
      targetId: actor.partyId,
      metadata: { txHash: normalizedHash },
      client,
    });
    return { txHash: normalizedHash, status };
  }
}
