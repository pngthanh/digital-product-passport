import { Inject, Injectable, Logger } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../common/persistence/transaction-scope.js';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import type { ChainEvent } from '../domain/chain-event.js';
import { decideConfirmation } from '../domain/transaction-confirmation.js';
import { CHAIN_READER, type ChainReader, type ChainReceipt } from './chain-reader.port.js';
import {
  type AwaitingTransaction,
  CHAIN_TRANSACTION_REPOSITORY,
  type ChainTransactionRepository,
} from './chain-transaction.repository.js';
import { CONTRACT_CATALOG, type ContractCatalog } from './contract-catalog.port.js';
import { EVENT_STORE, type EventStore } from './event-store.port.js';
import { EventProjectorRegistry } from './event-projector.js';

const BATCH_SIZE = 50;

export interface ConfirmationSummary {
  finalized: number;
  dropped: number;
  waiting: number;
}

/**
 * Worker: chốt kết quả các giao dịch đang chờ khi block đã finalized, ghi event vào
 * blockchain_events và gọi projector của module sở hữu event, tất cả trong một giao dịch CSDL.
 */
@Injectable()
export class ConfirmTransactions {
  private readonly logger = new Logger(ConfirmTransactions.name);

  constructor(
    @Inject(CHAIN_READER) private readonly reader: ChainReader,
    @Inject(CONTRACT_CATALOG) private readonly catalog: ContractCatalog,
    @Inject(CHAIN_TRANSACTION_REPOSITORY) private readonly repository: ChainTransactionRepository,
    @Inject(EVENT_STORE) private readonly events: EventStore,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly projectors: EventProjectorRegistry,
  ) {}

  async runOnce(): Promise<ConfirmationSummary> {
    const summary: ConfirmationSummary = { finalized: 0, dropped: 0, waiting: 0 };
    const awaiting = await this.repository.listAwaiting(BATCH_SIZE);
    if (awaiting.length === 0) {
      return summary;
    }
    const finalizedBlock = await this.reader.getFinalizedBlockNumber();
    for (const transaction of awaiting) {
      try {
        summary[await this.confirm(transaction, finalizedBlock)] += 1;
      } catch (error) {
        summary.waiting += 1;
        this.logger.error(
          `Không chốt được giao dịch ${transaction.txHash}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return summary;
  }

  private async confirm(
    transaction: AwaitingTransaction,
    finalizedBlock: bigint | null,
  ): Promise<keyof ConfirmationSummary> {
    const receipt = await this.reader.getReceipt(transaction.txHash);
    const decision = decideConfirmation({
      receipt: receipt && { succeeded: receipt.succeeded, blockNumber: receipt.blockNumber },
      finalizedBlock,
      submittedAt: transaction.submittedAt,
      now: this.clock.now(),
    });
    if (decision.kind === 'drop') {
      await this.repository.markDropped(
        transaction.id,
        'Giao dịch không được đưa vào block (ví đã huỷ hoặc thay bằng giao dịch khác).',
      );
      return 'dropped';
    }
    if (decision.kind === 'wait' || !receipt) {
      return 'waiting';
    }
    // Receipt lấy trước khi block bị thay thế thì hash lệch; đợi vòng sau đọc lại.
    const block = await this.reader.getBlock(receipt.blockNumber);
    if (!block || block.hash !== receipt.blockHash) {
      return 'waiting';
    }

    await this.unitOfWork.run(async (scope) => {
      await this.repository.markFinal(
        transaction.id,
        {
          status: decision.status,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          effectiveGasPrice: receipt.effectiveGasPrice,
          confirmedAt: this.clock.now(),
        },
        scope,
      );
      if (decision.status !== 'CONFIRMED') {
        return;
      }
      for (const event of this.decodeEvents(transaction.txHash, receipt, block.timestamp)) {
        // Indexer có thể đã chốt event này trước; `finalize` bảo đảm chỉ chiếu một lần.
        if (await this.events.finalize(event, scope)) {
          await this.projectors.find(event.contractName, event.eventName)?.project(event, scope);
        }
      }
    });
    return 'finalized';
  }

  private decodeEvents(txHash: string, receipt: ChainReceipt, blockTimestamp: Date): ChainEvent[] {
    return receipt.logs.flatMap((log) => {
      const decoded = this.catalog.decodeLog(log);
      return decoded
        ? [
            {
              ...decoded,
              chainId: this.reader.chainId,
              blockNumber: receipt.blockNumber,
              blockHash: receipt.blockHash,
              blockTimestamp,
              txHash,
              txIndex: receipt.transactionIndex,
              logIndex: log.logIndex,
              actorAddress: receipt.from,
            },
          ]
        : [];
    });
  }
}
