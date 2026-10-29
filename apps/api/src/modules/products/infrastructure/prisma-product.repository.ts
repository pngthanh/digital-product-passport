import { Injectable } from '@nestjs/common';
import type { ProductListFilter } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { Prisma, Product } from '../../../infrastructure/database/generated/client.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  NewProductDraft,
  ProductListQuery,
  ProductRepository,
  RegisteredProjection,
} from '../application/ports/product.repository.js';
import type { ProductRecord } from '../domain/product.js';

function toRecord(row: Product): ProductRecord {
  return {
    id: row.id,
    chainProductId: row.chainProductId,
    serialNumber: row.serialNumber,
    publicCode: row.publicCode,
    modelName: row.modelName,
    description: row.description,
    // Cột DATE đọc ra 00:00 UTC (phiên PostgreSQL đặt UTC).
    manufacturedOn: row.manufacturedOn.toISOString().slice(0, 10),
    warrantyMonths: row.warrantyMonths,
    metadataHash: row.metadataHash,
    issuerOrgId: row.issuerOrgId,
    productState: row.productState,
    currentCustodianPartyId: row.currentCustodianPartyId,
    createdTxHash: row.createdTxHash,
    syncStatus: row.syncStatus,
    onchainCreatedAt: row.onchainCreatedAt,
    createdAt: row.createdAt,
  };
}

function filterWhere(filter: ProductListFilter): Prisma.ProductWhereInput {
  if (filter === 'REGISTERED') {
    return { syncStatus: 'CONFIRMED' };
  }
  if (filter === 'DRAFT') {
    return { syncStatus: { not: 'CONFIRMED' } };
  }
  return {};
}

@Injectable()
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ProductRecord | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row && toRecord(row);
  }

  async findByPublicCode(publicCode: string): Promise<ProductRecord | null> {
    const row = await this.prisma.product.findUnique({ where: { publicCode } });
    return row && toRecord(row);
  }

  async findByChainProductId(chainProductId: string): Promise<ProductRecord | null> {
    const row = await this.prisma.product.findUnique({
      where: { chainProductId: chainProductId.toLowerCase() },
    });
    return row && toRecord(row);
  }

  async serialsTaken(issuerOrgId: string, serials: readonly string[]): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { issuerOrgId, serialNumber: { in: [...serials] } },
      select: { serialNumber: true },
    });
    return rows.map((row) => row.serialNumber);
  }

  async publicCodesTaken(codes: readonly string[]): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { publicCode: { in: [...codes] } },
      select: { publicCode: true },
    });
    return rows.map((row) => row.publicCode);
  }

  async createDrafts(
    drafts: readonly NewProductDraft[],
    scope: TransactionScope,
  ): Promise<ProductRecord[]> {
    const rows = await prismaFrom(this.prisma, scope).product.createManyAndReturn({
      data: drafts.map((draft) => ({
        chainProductId: draft.chainProductId,
        serialNumber: draft.serialNumber,
        publicCode: draft.publicCode,
        modelName: draft.modelName,
        description: draft.description,
        manufacturedOn: new Date(`${draft.manufacturedOn}T00:00:00Z`),
        warrantyMonths: draft.warrantyMonths,
        metadataHash: draft.metadataHash,
        issuerOrgId: draft.issuerOrgId,
      })),
    });
    const byChainId = new Map(rows.map((row) => [row.chainProductId, toRecord(row)]));
    return drafts.map((draft) => {
      const record = byChainId.get(draft.chainProductId);
      if (!record) {
        throw new Error(`Không tạo được bản nháp ${draft.serialNumber}`);
      }
      return record;
    });
  }

  async findOwned(issuerOrgId: string, ids: readonly string[]): Promise<ProductRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.product.findMany({
      where: { issuerOrgId, id: { in: [...ids] } },
    });
    return rows.map(toRecord);
  }

  async list(
    issuerOrgId: string,
    query: ProductListQuery,
  ): Promise<{ items: ProductRecord[]; total: number }> {
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      issuerOrgId,
      ...filterWhere(query.filter),
      ...(search
        ? {
            OR: [
              { serialNumber: { contains: search.toUpperCase() } },
              { modelName: { contains: search, mode: 'insensitive' } },
              { publicCode: { contains: search.toUpperCase().replaceAll('-', '') } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { serialNumber: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async counts(issuerOrgId: string): Promise<Record<ProductListFilter, number>> {
    const [all, registered] = await Promise.all([
      this.prisma.product.count({ where: { issuerOrgId } }),
      this.prisma.product.count({ where: { issuerOrgId, syncStatus: 'CONFIRMED' } }),
    ]);
    return { ALL: all, REGISTERED: registered, DRAFT: all - registered };
  }

  async deleteDraft(id: string): Promise<boolean> {
    const { count } = await this.prisma.product.deleteMany({
      where: { id, syncStatus: { not: 'CONFIRMED' }, productState: null },
    });
    return count === 1;
  }

  async markRegistered(
    id: string,
    projection: RegisteredProjection,
    scope: TransactionScope,
  ): Promise<ProductRecord> {
    const row = await prismaFrom(this.prisma, scope).product.update({
      where: { id },
      data: {
        productState: 'CREATED',
        currentCustodianPartyId: projection.issuerPartyId,
        createdTxHash: projection.txHash,
        onchainCreatedAt: projection.at,
        syncStatus: 'CONFIRMED',
      },
    });
    return toRecord(row);
  }

  async markFailed(id: string, scope: TransactionScope): Promise<void> {
    await prismaFrom(this.prisma, scope).product.update({
      where: { id },
      data: { syncStatus: 'FAILED' },
    });
  }

  async recordCustody(
    productId: string,
    toPartyId: string,
    eventId: string,
    at: Date,
    scope: TransactionScope,
  ): Promise<void> {
    await prismaFrom(this.prisma, scope).custodyRecord.createMany({
      data: [{ productId, fromPartyId: null, toPartyId, eventId, transferredAt: at }],
      skipDuplicates: true,
    });
  }
}
