import type { ProductListFilter } from '@dpp/shared';
import type { TransactionScope } from '../../../../common/persistence/transaction-scope.js';
import type { NormalizedProduct, ProductRecord } from '../../domain/product.js';

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
  findByChainProductId(chainProductId: string): Promise<ProductRecord | null>;
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
  /** custody_records: lần ghi đầu tiên không có bên giao (`fromPartyId` NULL). */
  recordCustody(
    productId: string,
    toPartyId: string,
    eventId: string,
    at: Date,
    scope: TransactionScope,
  ): Promise<void>;
}

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
