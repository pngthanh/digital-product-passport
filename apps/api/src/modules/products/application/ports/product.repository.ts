import type { InventoryFilter, ProductListFilter } from '@dpp/shared';
import type { TransactionScope } from '../../../../common/persistence/transaction-scope.js';
import type { NormalizedProduct, ProductRecord } from '../../domain/product.js';
import type { WarrantyRecord } from '../../domain/warranty.js';

export interface NewProductDraft extends NormalizedProduct {
  issuerOrgId: string;
  chainProductId: string;
  publicCode: string;
  metadataHash: string;
}

export interface ProductListQuery {
  filter: ProductListFilter;
  /** Tìm theo serial hoặc tên model (không phân biệt hoa thường). */
  search: string | null;
  page: number;
  pageSize: number;
}

export interface InventoryQuery {
  /** UUID Party của nhà bán lẻ. */
  retailerPartyId: string;
  filter: InventoryFilter;
  page: number;
  pageSize: number;
}

/** Một lần đổi bên giữ hàng hoặc chủ sở hữu, ghi custody_records / ownership_records. */
export interface HandoverRecord {
  productId: string;
  fromPartyId: string | null;
  toPartyId: string;
  eventId: string;
  at: Date;
}

export interface RegisteredProjection {
  /** UUID Party của nhà sản xuất (bên giữ hàng đầu tiên). */
  issuerPartyId: string;
  txHash: string;
  at: Date;
}

/** Bảng products và custody_records. */
export interface ProductRepository {
  findById(id: string): Promise<ProductRecord | null>;
  findByPublicCode(publicCode: string): Promise<ProductRecord | null>;
  /** `scope` để Worker đọc trong cùng giao dịch CSDL đang chiếu các event trước đó của cùng tx. */
  findByChainProductId(
    chainProductId: string,
    scope?: TransactionScope,
  ): Promise<ProductRecord | null>;
  /** Serial (đã chuẩn hoá) mà nhà sản xuất đã dùng, kể cả bản nháp. */
  serialsTaken(issuerOrgId: string, serials: readonly string[]): Promise<string[]>;
  publicCodesTaken(codes: readonly string[]): Promise<string[]>;
  /** Thứ tự kết quả giống thứ tự `drafts`. */
  createDrafts(
    drafts: readonly NewProductDraft[],
    scope: TransactionScope,
  ): Promise<ProductRecord[]>;
  findOwned(issuerOrgId: string, ids: readonly string[]): Promise<ProductRecord[]>;
  list(
    issuerOrgId: string,
    query: ProductListQuery,
  ): Promise<{ items: ProductRecord[]; total: number }>;
  counts(issuerOrgId: string): Promise<Record<ProductListFilter, number>>;
  /** Chỉ xoá được bản nháp; trả `false` nếu không còn bản nháp đó. */
  deleteDraft(id: string): Promise<boolean>;
  /** Chiếu ProductRegistered: bản nháp thành sản phẩm CREATED do nhà sản xuất giữ. */
  markRegistered(
    id: string,
    projection: RegisteredProjection,
    scope: TransactionScope,
  ): Promise<ProductRecord>;
  markFailed(id: string, scope: TransactionScope): Promise<void>;
  /** custody_records; lần ghi đầu tiên (đăng ký) không có bên giao. Ghi lại cùng event thì bỏ qua. */
  recordCustody(record: HandoverRecord, scope: TransactionScope): Promise<void>;
  /** ownership_records; lần bán đầu tiên không có bên giao. */
  recordOwnership(record: HandoverRecord, scope: TransactionScope): Promise<void>;

  // ----- M6: phân phối và bán (Worker chiếu từ event) -----
  /** DST-01: IN_DISTRIBUTION, chờ nhà bán lẻ `pendingPartyId` xác nhận. */
  markDispatched(id: string, pendingPartyId: string, scope: TransactionScope): Promise<void>;
  /** Huỷ gửi hoặc bị từ chối: về CREATED, hàng vẫn ở nhà sản xuất. */
  markHandoverClosed(id: string, scope: TransactionScope): Promise<void>;
  /** DST-02: AT_RETAIL, nhà bán lẻ thành bên giữ hàng. */
  markReceived(id: string, custodianPartyId: string, scope: TransactionScope): Promise<void>;
  /** DST-03: SOLD, người mua thành chủ sở hữu. */
  markSold(id: string, ownerPartyId: string, scope: TransactionScope): Promise<void>;
  setCustodian(id: string, custodianPartyId: string, scope: TransactionScope): Promise<void>;
  setOwner(id: string, ownerPartyId: string, scope: TransactionScope): Promise<void>;
  /** M10: RECALLED, LOST_STOLEN, RETIRED. */
  setLifecycleState(
    id: string,
    state: Extract<ProductRecord['productState'], 'RECALLED' | 'LOST_STOLEN' | 'RETIRED'>,
    scope: TransactionScope,
  ): Promise<void>;

  // ----- M6: truy vấn theo nhà bán lẻ và chủ sở hữu -----
  listInventory(query: InventoryQuery): Promise<{ items: ProductRecord[]; total: number }>;
  inventoryCounts(retailerPartyId: string): Promise<Record<InventoryFilter, number>>;
  /** Sản phẩm đang giao tới, đang giữ hoặc đã bán bởi nhà bán lẻ; `null` nếu không liên quan. */
  findForRetailer(retailerPartyId: string, id: string): Promise<ProductRecord | null>;
  /** Lúc nhà bán lẻ giao hàng cho người mua, theo productId. */
  soldAtBy(retailerPartyId: string, productIds: readonly string[]): Promise<Map<string, Date>>;
  listOwned(ownerPartyId: string): Promise<ProductRecord[]>;
  countOwned(ownerPartyId: string): Promise<number>;
  /** Lúc chủ hiện tại nhận quyền sở hữu, theo productId. */
  acquiredAt(ownerPartyId: string, productIds: readonly string[]): Promise<Map<string, Date>>;

  // ----- Bảo hành (warranties) -----
  findWarranties(productIds: readonly string[]): Promise<Map<string, WarrantyRecord>>;
  /** Ghi lại cùng giao dịch kích hoạt thì bỏ qua. */
  activateWarranty(warranty: WarrantyRecord, scope: TransactionScope): Promise<void>;
  setWarrantySuspended(
    productId: string,
    suspended: boolean,
    scope: TransactionScope,
  ): Promise<void>;
  /** Đồng bộ cột warranty_state: ACTIVE quá hạn thành EXPIRED (D10); trả số dòng đã đổi. */
  expireWarranties(now: Date): Promise<number>;
}

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
