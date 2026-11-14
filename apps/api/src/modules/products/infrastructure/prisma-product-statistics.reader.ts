import { Injectable } from '@nestjs/common';
import type { ProductState, WarrantyState } from '@dpp/shared';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  OwnershipBurst,
  ProductStatistics,
  ProductSummary,
} from '../application/ports/product-statistics.reader.js';

@Injectable()
export class PrismaProductStatistics implements ProductStatistics {
  constructor(private readonly prisma: PrismaService) {}

  async summary(now: Date): Promise<ProductSummary> {
    const notExpired = { expiresAt: { gt: now } };
    const [states, active, suspended, all] = await Promise.all([
      this.prisma.product.groupBy({ by: ['productState'], _count: { _all: true } }),
      this.prisma.warranty.count({ where: { warrantyState: 'ACTIVE', ...notExpired } }),
      this.prisma.warranty.count({ where: { warrantyState: 'SUSPENDED', ...notExpired } }),
      this.prisma.warranty.count(),
    ]);
    const byState: Record<ProductState, number> = {
      CREATED: 0,
      IN_DISTRIBUTION: 0,
      AT_RETAIL: 0,
      SOLD: 0,
      RECALLED: 0,
      LOST_STOLEN: 0,
      RETIRED: 0,
    };
    let drafts = 0;
    for (const group of states) {
      if (group.productState === null) {
        drafts = group._count._all;
      } else {
        byState[group.productState] = group._count._all;
      }
    }
    const warranties: Record<WarrantyState, number> = {
      ACTIVE: active,
      SUSPENDED: suspended,
      EXPIRED: all - active - suspended,
    };
    return { drafts, byState, warranties };
  }

  async ownershipBursts(since: Date, minChanges: number): Promise<OwnershipBurst[]> {
    const groups = await this.prisma.ownershipRecord.groupBy({
      by: ['productId'],
      where: { transferredAt: { gte: since } },
      _count: { _all: true },
      having: { productId: { _count: { gte: minChanges } } },
    });
    return groups.map((group) => ({ productId: group.productId, changes: group._count._all }));
  }
}
