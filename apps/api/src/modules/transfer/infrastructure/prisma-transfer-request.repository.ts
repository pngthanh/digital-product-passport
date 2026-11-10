import { Injectable } from '@nestjs/common';
import type { TransferFilter, TransferState } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { Prisma, TransferRequest } from '../../../infrastructure/database/generated/client.js';
import { isUniqueViolation } from '../../../infrastructure/database/prisma-errors.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  NewTransferRequest,
  TransferListQuery,
  TransferRequestRepository,
} from '../application/ports/transfer-request.repository.js';
import type { TransferRequestRecord } from '../domain/transfer-request.js';

function toRecord(row: TransferRequest): TransferRequestRecord {
  return {
    id: row.id,
    chainRequestId: row.chainRequestId,
    productId: row.productId,
    fromPartyId: row.fromPartyId,
    toPartyId: row.toPartyId,
    transferState: row.transferState,
    requestedAt: row.requestedAt,
    expiresAt: row.expiresAt,
    closedAt: row.closedAt,
    createdTxHash: row.createdTxHash,
    closedTxHash: row.closedTxHash,
  };
}

function filterWhere(
  partyIds: readonly string[],
  filter: TransferFilter,
): Prisma.TransferRequestWhereInput {
  const parties = [...partyIds];
  if (filter === 'INCOMING') {
    return { toPartyId: { in: parties }, transferState: 'REQUESTED' };
  }
  if (filter === 'OUTGOING') {
    return { fromPartyId: { in: parties }, transferState: 'REQUESTED' };
  }
  return {
    OR: [{ toPartyId: { in: parties } }, { fromPartyId: { in: parties } }],
    transferState: { not: 'REQUESTED' },
  };
}

@Injectable()
export class PrismaTransferRequestRepository implements TransferRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(request: NewTransferRequest, scope: TransactionScope): Promise<boolean> {
    try {
      await prismaFrom(this.prisma, scope).transferRequest.create({
        data: { ...request, transferState: 'REQUESTED' },
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  async findByChainId(
    chainRequestId: bigint,
    scope?: TransactionScope,
  ): Promise<TransferRequestRecord | null> {
    const row = await prismaFrom(this.prisma, scope).transferRequest.findUnique({
      where: { chainRequestId },
    });
    return row && toRecord(row);
  }

  async close(
    chainRequestId: bigint,
    state: Exclude<TransferState, 'REQUESTED'>,
    closure: { at: Date; txHash: string },
    scope: TransactionScope,
  ): Promise<TransferRequestRecord | null> {
    const db = prismaFrom(this.prisma, scope);
    const { count } = await db.transferRequest.updateMany({
      where: { chainRequestId, transferState: 'REQUESTED' },
      data: { transferState: state, closedAt: closure.at, closedTxHash: closure.txHash },
    });
    if (count === 0) {
      return null;
    }
    const row = await db.transferRequest.findUnique({ where: { chainRequestId } });
    return row && toRecord(row);
  }

  async openForProduct(productId: string): Promise<TransferRequestRecord | null> {
    const row = await this.prisma.transferRequest.findFirst({
      where: { productId, transferState: 'REQUESTED' },
    });
    return row && toRecord(row);
  }

  async closedSentBy(
    productId: string,
    partyIds: readonly string[],
  ): Promise<TransferRequestRecord[]> {
    const rows = await this.prisma.transferRequest.findMany({
      where: { productId, fromPartyId: { in: [...partyIds] }, transferState: { not: 'REQUESTED' } },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toRecord);
  }

  async listForParties(
    query: TransferListQuery,
  ): Promise<{ items: TransferRequestRecord[]; total: number }> {
    const where = filterWhere(query.partyIds, query.filter);
    const [rows, total] = await Promise.all([
      this.prisma.transferRequest.findMany({
        where,
        orderBy:
          query.filter === 'CLOSED'
            ? [{ closedAt: 'desc' }, { id: 'desc' }]
            : [{ expiresAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.transferRequest.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async countsForParties(partyIds: readonly string[]): Promise<Record<TransferFilter, number>> {
    const count = (filter: TransferFilter) =>
      this.prisma.transferRequest.count({ where: filterWhere(partyIds, filter) });
    const [incoming, outgoing, closed] = await Promise.all([
      count('INCOMING'),
      count('OUTGOING'),
      count('CLOSED'),
    ]);
    return { INCOMING: incoming, OUTGOING: outgoing, CLOSED: closed };
  }
}
