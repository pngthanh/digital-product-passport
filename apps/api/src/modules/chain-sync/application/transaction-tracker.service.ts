import { Inject, Injectable } from '@nestjs/common';
import { normalizeAddress, normalizeBytes32 } from '@dpp/shared';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import {
  ContractNotConfiguredError,
  TransactionMismatchError,
  TransactionNotFoundError,
} from '../domain/chain-sync.errors.js';
import type { TrackedTxStatus } from '../domain/transaction-confirmation.js';
import { CHAIN_READER, type ChainReader, type ChainTransactionInfo } from './chain-reader.port.js';
import {
  CHAIN_TRANSACTION_REPOSITORY,
  type ChainTransactionRepository,
} from './chain-transaction.repository.js';
import { CONTRACT_CATALOG, type ContractCatalog } from './contract-catalog.port.js';

export interface TrackTransactionInput {
  txHash: string;
  contractName: string;
  /** Ví phải là người gửi giao dịch. */
  expectedFrom: string;
  /** Hàm hợp lệ của nghiệp vụ đang chờ, ví dụ registerUser hoặc rotateWallet. */
  expectedMethods: readonly string[];
  initiatedByUserId: string | null;
}

/** Cổng theo dõi giao dịch mà module nghiệp vụ dùng (inject bằng TRANSACTION_TRACKING). */
export interface TransactionTracking {
  track(input: TrackTransactionInput): Promise<TrackedTxStatus>;
  statusOf(txHash: string): Promise<TrackedTxStatus | null>;
}

export const TRANSACTION_TRACKING = Symbol('TRANSACTION_TRACKING');

/** RPC có thể chưa thấy giao dịch vừa phát; thử lại vài lần trước khi báo không tìm thấy. */
const LOOKUP_ATTEMPTS = 5;
const LOOKUP_DELAY_MS = 600;

/**
 * Theo dõi giao dịch do ví người dùng tự ký và gửi (MetaMask). Web báo `txHash` về,
 * API kiểm tra giao dịch đúng contract, đúng ví, đúng hàm rồi ghi chain_transactions;
 * Worker chốt kết quả khi block finalized.
 */
@Injectable()
export class TransactionTracker implements TransactionTracking {
  protected readonly sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  constructor(
    @Inject(CHAIN_READER) private readonly reader: ChainReader,
    @Inject(CONTRACT_CATALOG) private readonly catalog: ContractCatalog,
    @Inject(CHAIN_TRANSACTION_REPOSITORY) private readonly repository: ChainTransactionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Bắt đầu theo dõi; gọi lại với cùng `txHash` không tạo bản ghi trùng. */
  async track(input: TrackTransactionInput): Promise<TrackedTxStatus> {
    const txHash = normalizeBytes32(input.txHash);
    const known = await this.repository.statusOf(txHash);
    if (known) {
      return known;
    }

    const contractAddress = this.catalog.addressOf(input.contractName);
    if (!contractAddress) {
      throw new ContractNotConfiguredError(input.contractName);
    }
    const transaction = await this.lookup(txHash);
    const expectedFrom = normalizeAddress(input.expectedFrom);
    const details = { txHash, contract: contractAddress, expectedFrom };
    if (transaction.to !== contractAddress) {
      throw new TransactionMismatchError(`không gửi tới ${input.contractName}`, details);
    }
    if (transaction.from !== expectedFrom) {
      throw new TransactionMismatchError('không được gửi từ ví đang liên kết', details);
    }
    const method = this.catalog.decodeMethod(input.contractName, transaction.data);
    if (!method || !input.expectedMethods.includes(method)) {
      throw new TransactionMismatchError(`không gọi ${input.expectedMethods.join(' hoặc ')}`, {
        ...details,
        method,
      });
    }

    await this.repository.insertSubmitted({
      chainId: this.reader.chainId,
      txHash,
      fromAddress: transaction.from,
      toAddress: contractAddress,
      contractName: input.contractName,
      method,
      nonce: transaction.nonce,
      gasLimit: transaction.gasLimit,
      maxFeePerGas: transaction.maxFeePerGas,
      maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
      valueWei: transaction.value,
      initiatedByUserId: input.initiatedByUserId,
      submittedAt: this.clock.now(),
    });
    return 'SUBMITTED';
  }

  async statusOf(txHash: string): Promise<TrackedTxStatus | null> {
    return this.repository.statusOf(normalizeBytes32(txHash));
  }

  private async lookup(txHash: string): Promise<ChainTransactionInfo> {
    for (let attempt = 1; attempt <= LOOKUP_ATTEMPTS; attempt += 1) {
      const transaction = await this.reader.getTransaction(txHash);
      if (transaction) {
        return transaction;
      }
      if (attempt < LOOKUP_ATTEMPTS) {
        await this.sleep(LOOKUP_DELAY_MS);
      }
    }
    throw new TransactionNotFoundError(txHash);
  }
}
