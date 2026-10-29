import { Injectable } from '@nestjs/common';
import type { FeeAction } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { Prisma } from '../../../infrastructure/database/generated/client.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  FeeLedgerRepository,
  FeePaymentRecord,
  FeePolicyRecord,
  PaidFee,
} from '../application/ports/fee-ledger.repository.js';

/** Cột NUMERIC(78,0) giữ đủ uint256; đổi qua chuỗi thập phân để không mất chính xác. */
function toWei(value: Prisma.Decimal): bigint {
  return BigInt(value.toFixed(0));
}

function toDecimal(value: bigint): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

@Injectable()
export class PrismaFeeLedgerRepository implements FeeLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPolicy(action: FeeAction): Promise<FeePolicyRecord | null> {
    const row = await this.prisma.feePolicy.findUnique({ where: { action } });
    return (
      row && { action: row.action, amountWei: toWei(row.amountWei), treasury: row.treasuryAddress }
    );
  }

  async paymentsOf(partyIds: readonly string[]): Promise<Map<string, FeePaymentRecord[]>> {
    const result = new Map<string, FeePaymentRecord[]>();
    if (partyIds.length === 0) {
      return result;
    }
    const rows = await this.prisma.feePayment.findMany({
      where: { partyId: { in: [...partyIds] } },
      orderBy: { paidAt: 'desc' },
    });
    for (const row of rows) {
      const payments = result.get(row.partyId) ?? [];
      payments.push({
        id: row.id,
        partyId: row.partyId,
        amountWei: toWei(row.amountWei),
        feeStatus: row.feeStatus,
        payerAddress: row.payerAddress,
        paidTxHash: row.paidTxHash,
        paidAt: row.paidAt,
        settledTxHash: row.settledTxHash,
        refundTxHash: row.refundTxHash,
      });
      result.set(row.partyId, payments);
    }
    return result;
  }

  async recordPaid(fee: PaidFee, scope: TransactionScope): Promise<string> {
    const db = prismaFrom(this.prisma, scope);
    await db.feePayment.createMany({
      data: [
        {
          partyId: fee.partyId,
          action: fee.action,
          amountWei: toDecimal(fee.amountWei),
          payerAddress: fee.payerAddress,
          feeStatus: 'ESCROWED',
          paidTxHash: fee.txHash,
          paidAt: fee.paidAt,
        },
      ],
      skipDuplicates: true,
    });
    const row = await db.feePayment.findUniqueOrThrow({
      where: { paidTxHash: fee.txHash },
      select: { id: true },
    });
    return row.id;
  }

  async settle(partyId: string, txHash: string, at: Date, scope: TransactionScope): Promise<void> {
    await prismaFrom(this.prisma, scope).feePayment.updateMany({
      where: { partyId, feeStatus: 'ESCROWED' },
      data: { feeStatus: 'SETTLED', settledTxHash: txHash, settledAt: at },
    });
  }

  async markRefundable(partyId: string, scope: TransactionScope): Promise<void> {
    await prismaFrom(this.prisma, scope).feePayment.updateMany({
      where: { partyId, feeStatus: 'ESCROWED' },
      data: { feeStatus: 'REFUNDABLE' },
    });
  }

  async markRefunded(
    partyId: string,
    txHash: string,
    at: Date,
    scope: TransactionScope,
  ): Promise<void> {
    await prismaFrom(this.prisma, scope).feePayment.updateMany({
      where: { partyId, feeStatus: 'REFUNDABLE' },
      data: { feeStatus: 'REFUNDED', refundTxHash: txHash, refundedAt: at },
    });
  }

  async upsertPolicy(
    policy: FeePolicyRecord,
    txHash: string,
    scope: TransactionScope,
  ): Promise<void> {
    const data = {
      amountWei: toDecimal(policy.amountWei),
      treasuryAddress: policy.treasury,
      updatedTxHash: txHash,
    };
    await prismaFrom(this.prisma, scope).feePolicy.upsert({
      where: { action: policy.action },
      create: { action: policy.action, ...data },
      update: data,
    });
  }

  async updateTreasury(treasury: string, txHash: string, scope: TransactionScope): Promise<void> {
    await prismaFrom(this.prisma, scope).feePolicy.updateMany({
      data: { treasuryAddress: treasury, updatedTxHash: txHash },
    });
  }
}
