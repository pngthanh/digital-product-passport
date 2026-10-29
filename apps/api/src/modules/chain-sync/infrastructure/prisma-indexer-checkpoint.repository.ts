import { Injectable } from '@nestjs/common';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  IndexerCheckpointRepository,
  StoredCheckpoint,
} from '../application/indexer-checkpoint.repository.js';
import type { IndexerCheckpoint } from '../domain/indexer-checkpoint.js';

@Injectable()
export class PrismaIndexerCheckpointRepository implements IndexerCheckpointRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(chainId: number, contractAddress: string): Promise<StoredCheckpoint | null> {
    const row = await this.prisma.indexerCheckpoint.findUnique({
      where: { chainId_contractAddress: { chainId, contractAddress } },
    });
    return row
      ? {
          chainId: row.chainId,
          contractAddress: row.contractAddress,
          lastObservedBlock: row.lastObservedBlock,
          lastFinalizedBlock: row.lastFinalizedBlock,
          lastFinalizedBlockHash: row.lastFinalizedBlockHash,
          updatedAt: row.updatedAt,
        }
      : null;
  }

  async save(checkpoint: IndexerCheckpoint, scope?: TransactionScope): Promise<void> {
    const { chainId, contractAddress } = checkpoint;
    // Chỉ lấy đúng các cột tiến độ: mốc đọc từ find() còn kèm updatedAt cũ, truyền vào thì Prisma
    // ghi lại giá trị cũ thay vì tự cập nhật.
    const progress = {
      lastObservedBlock: checkpoint.lastObservedBlock,
      lastFinalizedBlock: checkpoint.lastFinalizedBlock,
      lastFinalizedBlockHash: checkpoint.lastFinalizedBlockHash,
    };
    await prismaFrom(this.prisma, scope).indexerCheckpoint.upsert({
      where: { chainId_contractAddress: { chainId, contractAddress } },
      create: { chainId, contractAddress, ...progress },
      update: progress,
    });
  }
}
