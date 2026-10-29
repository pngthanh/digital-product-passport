import { Injectable } from '@nestjs/common';
import type { InventoryFilter, ProductListFilter } from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type {
  Prisma,
  Product,
  Warranty,
} from '../../../infrastructure/database/generated/client.js';
import { prismaFrom } from '../../../infrastructure/database/prisma-scope.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type {
  HandoverRecord,
  InventoryQuery,
  NewProductDraft,
  ProductListQuery,
  ProductRepository,
  RegisteredProjection,
} from '../application/ports/product.repository.js';
import type { ProductRecord } from '../domain/product.js';
import type { WarrantyRecord } from '../domain/warranty.js';

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
    pendingCustodianPartyId: row.pendingCustodianPartyId,
    currentOwnerPartyId: row.currentOwnerPartyId,
    createdTxHash: row.createdTxHash,
    syncStatus: row.syncStatus,
    onchainCreatedAt: row.onchainCreatedAt,
    createdAt: row.createdAt,
  };
}

function toWarranty(row: Warranty): WarrantyRecord {
  return {
    productId: row.productId,
    activatedByPartyId: row.activatedByPartyId,
    activatedAt: row.activatedAt,
    expiresAt: row.expiresAt,
    warrantyState: row.warrantyState,
    activationTxHash: row.activationTxHash,
  };
}

/**
 * Kho của nhà bán lẻ: chờ nhận (đang giao tới), đang bán (đang giữ ở cửa hàng), đã bán (từng giao
 * hàng cho người mua; custody đi từ nhà bán lẻ chỉ xảy ra khi bán).
 */
function inventoryWhere(
  retailerPartyId: string,
  filter: InventoryFilter,
): Prisma.ProductWhereInput {
  if (filter === 'INCOMING') {
    return { pendingCustodianPartyId: retailerPartyId, productState: 'IN_DISTRIBUTION' };
  }
  if (filter === 'IN_STOCK') {
    return { currentCustodianPartyId: retailerPartyId, productState: 'AT_RETAIL' };
  }
  return { custodyRecords: { some: { fromPartyId: retailerPartyId } } };
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

  async findByChainProductId(
    chainProductId: string,
    scope?: TransactionScope,
  ): Promise<ProductRecord | null> {
    const row = await prismaFrom(this.prisma, scope).product.findUnique({
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

  async recordCustody(record: HandoverRecord, scope: TransactionScope): Promise<void> {
    await prismaFrom(this.prisma, scope).custodyRecord.createMany({
      data: [
        {
          productId: record.productId,
          fromPartyId: record.fromPartyId,
          toPartyId: record.toPartyId,
          eventId: record.eventId,
          transferredAt: record.at,
        },
      ],
      skipDuplicates: true,
    });
  }

  async recordOwnership(record: HandoverRecord, scope: TransactionScope): Promise<void> {
    await prismaFrom(this.prisma, scope).ownershipRecord.createMany({
      data: [
        {
          productId: record.productId,
          fromPartyId: record.fromPartyId,
          toPartyId: record.toPartyId,
          eventId: record.eventId,
          transferredAt: record.at,
        },
      ],
      skipDuplicates: true,
    });
  }

  async markDispatched(id: string, pendingPartyId: string, scope: TransactionScope) {
    await this.update(
      id,
      { productState: 'IN_DISTRIBUTION', pendingCustodianPartyId: pendingPartyId },
      scope,
    );
  }

  async markHandoverClosed(id: string, scope: TransactionScope) {
    await this.update(id, { productState: 'CREATED', pendingCustodianPartyId: null }, scope);
  }

  async markReceived(id: string, custodianPartyId: string, scope: TransactionScope) {
    await this.update(
      id,
      {
        productState: 'AT_RETAIL',
        currentCustodianPartyId: custodianPartyId,
        pendingCustodianPartyId: null,
      },
      scope,
    );
  }

  async markSold(id: string, ownerPartyId: string, scope: TransactionScope) {
    await this.update(id, { productState: 'SOLD', currentOwnerPartyId: ownerPartyId }, scope);
  }

  async setCustodian(id: string, custodianPartyId: string, scope: TransactionScope) {
    await this.update(id, { currentCustodianPartyId: custodianPartyId }, scope);
  }

  async setOwner(id: string, ownerPartyId: string, scope: TransactionScope) {
    await this.update(id, { currentOwnerPartyId: ownerPartyId }, scope);
  }

  async setLifecycleState(
    id: string,
    state: 'RECALLED' | 'LOST_STOLEN' | 'RETIRED',
    scope: TransactionScope,
  ) {
    await this.update(id, { productState: state, pendingCustodianPartyId: null }, scope);
  }

  async listInventory(query: InventoryQuery): Promise<{ items: ProductRecord[]; total: number }> {
    const where = inventoryWhere(query.retailerPartyId, query.filter);
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { serialNumber: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async inventoryCounts(retailerPartyId: string): Promise<Record<InventoryFilter, number>> {
    const [INCOMING, IN_STOCK, SOLD] = await Promise.all(
      (['INCOMING', 'IN_STOCK', 'SOLD'] as const).map((filter) =>
        this.prisma.product.count({ where: inventoryWhere(retailerPartyId, filter) }),
      ),
    );
    return { INCOMING: INCOMING ?? 0, IN_STOCK: IN_STOCK ?? 0, SOLD: SOLD ?? 0 };
  }

  async findForRetailer(retailerPartyId: string, id: string): Promise<ProductRecord | null> {
    const row = await this.prisma.product.findFirst({
      where: {
        id,
        OR: (['INCOMING', 'IN_STOCK', 'SOLD'] as const).map((filter) =>
          inventoryWhere(retailerPartyId, filter),
        ),
      },
    });
    return row && toRecord(row);
  }

  async soldAtBy(
    retailerPartyId: string,
    productIds: readonly string[],
  ): Promise<Map<string, Date>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.custodyRecord.findMany({
      where: { fromPartyId: retailerPartyId, productId: { in: [...productIds] } },
      orderBy: { transferredAt: 'asc' },
      select: { productId: true, transferredAt: true },
    });
    return new Map(rows.map((row) => [row.productId, row.transferredAt]));
  }

  async listOwned(ownerPartyId: string): Promise<ProductRecord[]> {
    const rows = await this.prisma.product.findMany({
      where: { currentOwnerPartyId: ownerPartyId },
      orderBy: [{ updatedAt: 'desc' }],
    });
    return rows.map(toRecord);
  }

  countOwned(ownerPartyId: string): Promise<number> {
    return this.prisma.product.count({ where: { currentOwnerPartyId: ownerPartyId } });
  }

  async acquiredAt(
    ownerPartyId: string,
    productIds: readonly string[],
  ): Promise<Map<string, Date>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.ownershipRecord.findMany({
      where: { toPartyId: ownerPartyId, productId: { in: [...productIds] } },
      orderBy: { transferredAt: 'asc' },
      select: { productId: true, transferredAt: true },
    });
    // Sắp tăng dần nên lần nhận gần nhất ghi đè lần trước.
    return new Map(rows.map((row) => [row.productId, row.transferredAt]));
  }

  async findWarranties(productIds: readonly string[]): Promise<Map<string, WarrantyRecord>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.warranty.findMany({
      where: { productId: { in: [...productIds] } },
    });
    return new Map(rows.map((row) => [row.productId, toWarranty(row)]));
  }

  async activateWarranty(warranty: WarrantyRecord, scope: TransactionScope): Promise<void> {
    await prismaFrom(this.prisma, scope).warranty.createMany({
      data: [warranty],
      skipDuplicates: true,
    });
  }

  async setWarrantySuspended(productId: string, suspended: boolean, scope: TransactionScope) {
    await prismaFrom(this.prisma, scope).warranty.updateMany({
      where: { productId, warrantyState: suspended ? 'ACTIVE' : 'SUSPENDED' },
      data: { warrantyState: suspended ? 'SUSPENDED' : 'ACTIVE' },
    });
  }

  async expireWarranties(now: Date): Promise<number> {
    const { count } = await this.prisma.warranty.updateMany({
      where: { warrantyState: { in: ['ACTIVE', 'SUSPENDED'] }, expiresAt: { lte: now } },
      data: { warrantyState: 'EXPIRED' },
    });
    return count;
  }

  private async update(
    id: string,
    data: Prisma.ProductUncheckedUpdateInput,
    scope: TransactionScope,
  ): Promise<void> {
    await prismaFrom(this.prisma, scope).product.update({ where: { id }, data });
  }
}
