import {
  normalizeSerialNumber,
  normalizeText,
  type ProductInput,
  type ProductMetadata,
  type ProductState,
  type SyncStatus,
} from '@dpp/shared';

/** Dòng products (dữ liệu [A+P]). */
export interface ProductRecord {
  id: string;
  chainProductId: string;
  serialNumber: string;
  publicCode: string;
  modelName: string;
  description: string | null;
  /** YYYY-MM-DD. */
  manufacturedOn: string;
  warrantyMonths: number;
  metadataHash: string;
  issuerOrgId: string;
  productState: ProductState | null;
  /** UUID dòng parties; tổ chức dùng chung UUID với organizations (D25). */
  currentCustodianPartyId: string | null;
  pendingCustodianPartyId: string | null;
  currentOwnerPartyId: string | null;
  createdTxHash: string | null;
  syncStatus: SyncStatus;
  onchainCreatedAt: Date | null;
  createdAt: Date;
}

/** Hồ sơ đã chuẩn hoá, sẵn sàng băm và lưu. */
export type NormalizedProduct = Omit<ProductMetadata, 'issuerPartyId'>;

/** Bản nháp: đã lưu hồ sơ nhưng Indexer chưa thấy ProductRegistered (hoặc hồ sơ lệch chain). */
export function isDraft(product: Pick<ProductRecord, 'syncStatus'>): boolean {
  return product.syncStatus !== 'CONFIRMED';
}

/**
 * Chuẩn hoá trước khi lưu và băm: serial chữ in hoa, bỏ khoảng trắng thừa, mô tả rỗng thành `null`.
 * Ngày sản xuất đã được tầng presentation đưa về YYYY-MM-DD.
 */
export function normalizeProduct(input: ProductInput): NormalizedProduct {
  return {
    serialNumber: normalizeSerialNumber(input.serialNumber),
    modelName: normalizeText(input.modelName) ?? '',
    description: normalizeText(input.description),
    manufacturedOn: input.manufacturedOn,
    warrantyMonths: input.warrantyMonths,
  };
}

export function metadataOf(product: NormalizedProduct, issuerPartyId: string): ProductMetadata {
  return { issuerPartyId, ...product };
}

/** Serial xuất hiện từ hai lần trở lên trong cùng một lô. */
export function duplicateSerials(products: readonly Pick<NormalizedProduct, 'serialNumber'>[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { serialNumber } of products) {
    if (seen.has(serialNumber)) {
      duplicates.add(serialNumber);
    }
    seen.add(serialNumber);
  }
  return [...duplicates];
}
