import type { ProductRegistration, ProductSale } from '@dpp/shared';

/** Hồ sơ của một sản phẩm đọc từ `ProductPassport.product()` (phiên bản 2). */
export interface OnchainProduct {
  issuerId: string;
  metadataHash: string;
  custodianId: string;
  /** bytes32(0) khi không có. */
  pendingCustodianId: string;
  ownerId: string;
  /** Giá trị enum ProductState on-chain (0 = NONE). */
  state: number;
  warrantyMonths: number;
}

/** ProductPassport: ký giấy phép bằng khoá registrar và đọc hàm view. */
export interface ProductChain {
  readonly chainId: number;
  /** Chữ thường; `null` khi chưa cấu hình. */
  readonly contractAddress: string | null;
  signRegistration(registration: ProductRegistration): Promise<string>;
  signSale(sale: ProductSale): Promise<string>;
  /** `null` nếu sản phẩm chưa đăng ký on-chain. */
  readProduct(chainProductId: string): Promise<OnchainProduct | null>;
}

export const PRODUCT_CHAIN = Symbol('PRODUCT_CHAIN');

/** Sinh mã QR công khai ngẫu nhiên. */
export interface PublicCodeGenerator {
  next(): string;
}

export const PUBLIC_CODE_GENERATOR = Symbol('PUBLIC_CODE_GENERATOR');
