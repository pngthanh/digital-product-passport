import { Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { isUniqueViolation } from '../../../infrastructure/database/prisma-errors.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  AwaitingTransaction,
  ChainTransactionRepository,
  FinalTransactionResult,
  SubmittedTransaction,
} from '../application/chain-transaction.repository.js';
import type { TrackedTxStatus } from '../domain/transaction-confirmation.js';

@Injectable()
export class PrismaChainTransactionRepository implements ChainTransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async statusOf(txHash: string): Promise<TrackedTxStatus | null> {
    const row = await this.prisma.chainTransaction.findUnique({
      where: { txHash },
      select: { txStatus: true },
    });
    return row && row.txStatus !== 'QUEUED' ? row.txStatus : null;
  }

  async insertSubmitted(transaction: SubmittedTransaction): Promise<void> {
    try {
      await this.prisma.chainTransaction.create({
        data: {
          chainId: transaction.chainId,
          txHash: transaction.txHash,
          fromAddress: transaction.fromAddress,
          toAddress: transaction.toAddress,
          contractName: transaction.contractName,
          method: transaction.method,
          nonce: transaction.nonce,
          gasLimit: transaction.gasLimit,
          maxFeePerGas: transaction.maxFeePerGas?.toString() ?? null,
          maxPriorityFeePerGas: transaction.maxPriorityFeePerGas?.toString() ?? null,
          valueWei: transaction.valueWei.toString(),
          txStatus: 'SUBMITTED',
          initiatedByUserId: transaction.initiatedByUserId,
          submittedAt: transaction.submittedAt,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error, 'tx_hash')) {
        throw error;
      }
    }
  }

  async listAwaiting(limit: number): Promise<AwaitingTransaction[]> {
    const rows = await this.prisma.chainTransaction.findMany({
      where: { txStatus: 'SUBMITTED', txHash: { not: null } },
      orderBy: { submittedAt: 'asc' },
      take: limit,
      select: { id: true, txHash: true, submittedAt: true, createdAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      txHash: row.txHash ?? '',
      submittedAt: row.submittedAt ?? row.createdAt,
    }));
  }

  async markFinal(
    id: string,
    result: FinalTransactionResult,
    scope: TransactionScope,
  ): Promise<void> {
    await prismaFrom(this.prisma, scope).chainTransaction.update({
      where: { id },
      data: {
        txStatus: result.status,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
        effectiveGasPrice: result.effectiveGasPrice.toString(),
        confirmedAt: result.confirmedAt,
        errorReason: result.status === 'REVERTED' ? 'Contract từ chối giao dịch (revert).' : null,
      },
    });
  }

  async markDropped(id: string, reason: string): Promise<void> {
    await this.prisma.chainTransaction.update({
      where: { id },
      data: { txStatus: 'FAILED', errorReason: reason },
    });
  }
}
