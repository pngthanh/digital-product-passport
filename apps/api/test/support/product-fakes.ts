import { randomUUID } from 'node:crypto';
import {
  type InventoryFilter,
  PRODUCT_REGISTRATION_TYPES,
  PRODUCT_SALE_TYPES,
  type ProductListFilter,
  type ProductRegistration,
  type ProductSale,
  productPassportDomain,
  PUBLIC_CODE_ALPHABET,
} from '@dpp/shared';
import { Wallet } from 'ethers';
import type { AnomalyAlertWriter } from '../../src/modules/audit/application/anomaly-alert.writer.js';
import type { NewAnomalyAlert } from '../../src/modules/audit/domain/anomaly-alert.js';
import type {
  OnchainProduct,
  ProductChain,
  PublicCodeGenerator,
} from '../../src/modules/products/application/ports/product-chain.port.js';
import type {
  HandoverRecord,
  InventoryQuery,
  NewProductDraft,
  ProductListQuery,
  ProductRepository,
  RegisteredProjection,
} from '../../src/modules/products/application/ports/product.repository.js';
import { isDraft, type ProductRecord } from '../../src/modules/products/domain/product.js';
import type { WarrantyRecord } from '../../src/modules/products/domain/warranty.js';
import { TEST_REGISTRAR_KEY } from './test-config.js';

export const TEST_PRODUCT_PASSPORT = '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512';

const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;

/** Bản ghi `ProductPassport.product()` của sản phẩm vừa đăng ký (nhà sản xuất giữ hàng). */
export function onchainProduct(
  issuerId: string,
  metadataHash: string,
  overrides: Partial<OnchainProduct> = {},
): OnchainProduct {
  return {
    issuerId,
    metadataHash,
    custodianId: issuerId,
    pendingCustodianId: ZERO_BYTES32,
    ownerId: ZERO_BYTES32,
    state: 1,
    warrantyMonths: 24,
    ...overrides,
  };
}

/**
 * products, custody_records, ownership_records, warranties trong bộ nhớ; giữ UNIQUE(issuer, serial),
 * UNIQUE(public_code) và hai CHECK về owner/bên nhận chờ của bảng products.
 */
export class InMemoryProducts implements ProductRepository {
  readonly rows: ProductRecord[] = [];
  readonly custody: HandoverRecord[] = [];
  readonly ownership: HandoverRecord[] = [];
  readonly warrantyRows = new Map<string, WarrantyRecord>();

  async findById(id: string) {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async findByPublicCode(publicCode: string) {
    return this.rows.find((row) => row.publicCode === publicCode) ?? null;
  }

  async findByChainProductId(chainProductId: string) {
    return this.rows.find((row) => row.chainProductId === chainProductId.toLowerCase()) ?? null;
  }

  async serialsTaken(issuerOrgId: string, serials: readonly string[]) {
    return this.rows
      .filter((row) => row.issuerOrgId === issuerOrgId && serials.includes(row.serialNumber))
      .map((row) => row.serialNumber);
  }

  async publicCodesTaken(codes: readonly string[]) {
    return this.rows.filter((row) => codes.includes(row.publicCode)).map((row) => row.publicCode);
  }

  async createDrafts(drafts: readonly NewProductDraft[]) {
    const created = drafts.map((draft): ProductRecord => ({
      ...draft,
      id: randomUUID(),
      productState: null,
      currentCustodianPartyId: null,
      pendingCustodianPartyId: null,
      currentOwnerPartyId: null,
      createdTxHash: null,
      syncStatus: 'PENDING',
      onchainCreatedAt: null,
      createdAt: new Date(),
    }));
    for (const row of created) {
      if (
        this.rows.some(
          (other) =>
            other.publicCode === row.publicCode ||
            (other.issuerOrgId === row.issuerOrgId && other.serialNumber === row.serialNumber),
        )
      ) {
        throw new Error('unique violation');
      }
    }
    this.rows.push(...created);
    return created;
  }

  async findOwned(issuerOrgId: string, ids: readonly string[]) {
    return this.rows.filter((row) => row.issuerOrgId === issuerOrgId && ids.includes(row.id));
  }

  async list(issuerOrgId: string, query: ProductListQuery) {
    const items = this.rows.filter(
      (row) =>
        row.issuerOrgId === issuerOrgId &&
        (query.filter === 'ALL' || (query.filter === 'DRAFT') === isDraft(row)),
    );
    const start = (query.page - 1) * query.pageSize;
    return { items: items.slice(start, start + query.pageSize), total: items.length };
  }

  async counts(issuerOrgId: string): Promise<Record<ProductListFilter, number>> {
    const own = this.rows.filter((row) => row.issuerOrgId === issuerOrgId);
    const drafts = own.filter(isDraft).length;
    return { ALL: own.length, REGISTERED: own.length - drafts, DRAFT: drafts };
  }

  async deleteDraft(id: string) {
    const index = this.rows.findIndex((row) => row.id === id && isDraft(row));
    if (index < 0) {
      return false;
    }
    this.rows.splice(index, 1);
    return true;
  }

  async markRegistered(id: string, projection: RegisteredProjection) {
    const index = this.rows.findIndex((row) => row.id === id);
    const row = this.rows[index];
    if (!row) {
      throw new Error(`Không có sản phẩm ${id}`);
    }
    const next: ProductRecord = {
      ...row,
      productState: 'CREATED',
      currentCustodianPartyId: projection.issuerPartyId,
      createdTxHash: projection.txHash,
      onchainCreatedAt: projection.at,
      syncStatus: 'CONFIRMED',
    };
    this.rows[index] = next;
    return next;
  }

  async markFailed(id: string) {
    const index = this.rows.findIndex((row) => row.id === id);
    const row = this.rows[index];
    if (row) {
      this.rows[index] = { ...row, syncStatus: 'FAILED' };
    }
  }

  async recordCustody(record: HandoverRecord) {
    if (!this.custody.some((existing) => existing.eventId === record.eventId)) {
      this.custody.push(record);
    }
  }

  async recordOwnership(record: HandoverRecord) {
    if (!this.ownership.some((existing) => existing.eventId === record.eventId)) {
      this.ownership.push(record);
    }
  }

  async markDispatched(id: string, pendingPartyId: string) {
    this.patch(id, { productState: 'IN_DISTRIBUTION', pendingCustodianPartyId: pendingPartyId });
  }

  async markHandoverClosed(id: string) {
    this.patch(id, { productState: 'CREATED', pendingCustodianPartyId: null });
  }

  async markReceived(id: string, custodianPartyId: string) {
    this.patch(id, {
      productState: 'AT_RETAIL',
      currentCustodianPartyId: custodianPartyId,
      pendingCustodianPartyId: null,
    });
  }

  async markSold(id: string, ownerPartyId: string) {
    this.patch(id, { productState: 'SOLD', currentOwnerPartyId: ownerPartyId });
  }

  async setCustodian(id: string, custodianPartyId: string) {
    this.patch(id, { currentCustodianPartyId: custodianPartyId });
  }

  async setOwner(id: string, ownerPartyId: string) {
    this.patch(id, { currentOwnerPartyId: ownerPartyId });
  }

  async setLifecycleState(id: string, state: 'RECALLED' | 'LOST_STOLEN' | 'RETIRED') {
    this.patch(id, { productState: state, pendingCustodianPartyId: null });
  }

  async listInventory(query: InventoryQuery) {
    const items = this.rows.filter((row) =>
      this.inInventory(row, query.retailerPartyId, query.filter),
    );
    const start = (query.page - 1) * query.pageSize;
    return { items: items.slice(start, start + query.pageSize), total: items.length };
  }

  async inventoryCounts(retailerPartyId: string): Promise<Record<InventoryFilter, number>> {
    const count = (filter: InventoryFilter) =>
      this.rows.filter((row) => this.inInventory(row, retailerPartyId, filter)).length;
    return { INCOMING: count('INCOMING'), IN_STOCK: count('IN_STOCK'), SOLD: count('SOLD') };
  }

  async findForRetailer(retailerPartyId: string, id: string) {
    return (
      this.rows.find(
        (row) =>
          row.id === id &&
          (['INCOMING', 'IN_STOCK', 'SOLD'] as const).some((filter) =>
            this.inInventory(row, retailerPartyId, filter),
          ),
      ) ?? null
    );
  }

  async soldAtBy(retailerPartyId: string, productIds: readonly string[]) {
    return new Map(
      this.custody
        .filter(
          (record) =>
            record.fromPartyId === retailerPartyId && productIds.includes(record.productId),
        )
        .map((record) => [record.productId, record.at]),
    );
  }

  async listOwned(ownerPartyIds: readonly string[]) {
    return this.rows.filter(
      (row) => row.currentOwnerPartyId !== null && ownerPartyIds.includes(row.currentOwnerPartyId),
    );
  }

  async countOwned(ownerPartyIds: readonly string[]) {
    return (await this.listOwned(ownerPartyIds)).length;
  }

  async acquiredAt(ownerPartyIds: readonly string[], productIds: readonly string[]) {
    return new Map(
      this.ownership
        .filter(
          (record) =>
            ownerPartyIds.includes(record.toPartyId) && productIds.includes(record.productId),
        )
        .map((record) => [record.productId, record.at]),
    );
  }

  async linkOwnershipTransfer() {
    return false;
  }

  async findWarranties(productIds: readonly string[]) {
    return new Map([...this.warrantyRows].filter(([productId]) => productIds.includes(productId)));
  }

  async activateWarranty(warranty: WarrantyRecord) {
    if (!this.warrantyRows.has(warranty.productId)) {
      this.warrantyRows.set(warranty.productId, warranty);
    }
  }

  async setWarrantySuspended(productId: string, suspended: boolean) {
    const warranty = this.warrantyRows.get(productId);
    if (warranty && warranty.warrantyState === (suspended ? 'ACTIVE' : 'SUSPENDED')) {
      this.warrantyRows.set(productId, {
        ...warranty,
        warrantyState: suspended ? 'SUSPENDED' : 'ACTIVE',
      });
    }
  }

  async expireWarranties(now: Date) {
    let expired = 0;
    for (const [productId, warranty] of this.warrantyRows) {
      if (warranty.warrantyState !== 'EXPIRED' && warranty.expiresAt <= now) {
        this.warrantyRows.set(productId, { ...warranty, warrantyState: 'EXPIRED' });
        expired += 1;
      }
    }
    return expired;
  }

  private inInventory(row: ProductRecord, retailerPartyId: string, filter: InventoryFilter) {
    if (filter === 'INCOMING') {
      return row.pendingCustodianPartyId === retailerPartyId;
    }
    if (filter === 'IN_STOCK') {
      return row.currentCustodianPartyId === retailerPartyId && row.productState === 'AT_RETAIL';
    }
    return this.custody.some(
      (record) => record.productId === row.id && record.fromPartyId === retailerPartyId,
    );
  }

  /** Cập nhật như một lệnh UPDATE, kiểm tra hai CHECK của bảng products. */
  private patch(id: string, changes: Partial<ProductRecord>) {
    const index = this.rows.findIndex((row) => row.id === id);
    const row = this.rows[index];
    if (!row) {
      throw new Error(`Không có sản phẩm ${id}`);
    }
    const next = { ...row, ...changes };
    const unsold = ['CREATED', 'IN_DISTRIBUTION', 'AT_RETAIL'].includes(next.productState ?? '');
    if (unsold && next.currentOwnerPartyId !== null) {
      throw new Error('ck_products_owner_matches_state');
    }
    if ((next.productState === 'IN_DISTRIBUTION') !== (next.pendingCustodianPartyId !== null)) {
      throw new Error('ck_products_pending_custodian');
    }
    this.rows[index] = next;
  }

  only(): ProductRecord {
    const [row] = this.rows;
    if (!row) {
      throw new Error('Chưa có sản phẩm nào');
    }
    return row;
  }
}

/** ProductPassport giả: ký giấy phép bằng khoá registrar của test; sản phẩm on-chain chỉnh được. */
export class FakeProductChain implements ProductChain {
  readonly chainId = 31337;
  contractAddress: string | null = TEST_PRODUCT_PASSPORT;
  readonly onchain = new Map<string, OnchainProduct>();
  readonly signed: ProductRegistration[] = [];
  readonly sales: ProductSale[] = [];
  failing = false;
  private readonly registrar = new Wallet(TEST_REGISTRAR_KEY);

  async signRegistration(registration: ProductRegistration) {
    this.signed.push(registration);
    return this.registrar.signTypedData(
      productPassportDomain(this.chainId, this.contractAddress ?? ''),
      PRODUCT_REGISTRATION_TYPES,
      registration,
    );
  }

  async signSale(sale: ProductSale) {
    this.sales.push(sale);
    return this.registrar.signTypedData(
      productPassportDomain(this.chainId, this.contractAddress ?? ''),
      PRODUCT_SALE_TYPES,
      sale,
    );
  }

  async readProduct(chainProductId: string) {
    if (this.failing) {
      throw new Error('connect ECONNREFUSED');
    }
    return this.onchain.get(chainProductId.toLowerCase()) ?? null;
  }
}

/** Trả lần lượt các mã cho trước (để thử trường hợp trùng), hết thì sinh mã theo số thứ tự. */
export class SequenceCodes implements PublicCodeGenerator {
  private counter = 0;

  constructor(private readonly queue: string[] = []) {}

  next(): string {
    const queued = this.queue.shift();
    if (queued) {
      return queued;
    }
    this.counter += 1;
    let rest = this.counter;
    let suffix = '';
    for (let digit = 0; digit < 4; digit += 1) {
      suffix = `${PUBLIC_CODE_ALPHABET[rest % 32] ?? 'A'}${suffix}`;
      rest = Math.floor(rest / 32);
    }
    return `KMNPQRST${suffix}`;
  }
}

/** Ghi cảnh báo như PrismaAnomalyAlertWriter (không gộp theo sản phẩm, đủ cho test). */
export class RecordingAlerts implements AnomalyAlertWriter {
  readonly raised: NewAnomalyAlert[] = [];

  async raiseIfNew(alert: NewAnomalyAlert) {
    this.raised.push(alert);
    return true;
  }
}
