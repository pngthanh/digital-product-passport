import type { ProductRegistration } from '@dpp/shared';

/** Hồ sơ của một sản phẩm đọc từ `ProductPassport.product()`. */
export interface OnchainProduct {
  issuerId: string;
  metadataHash: string;
  /** Giá trị enum ProductState on-chain (0 = NONE). */
  state: number;
}

/** ProductPassport: ký giấy phép bằng khoá registrar và đọc hàm view. */
export interface ProductChain {
  readonly chainId: number;
  /** Chữ thường; `null` khi chưa cấu hình. */
  readonly contractAddress: string | null;
  signRegistration(registration: ProductRegistration): Promise<string>;
  /** `null` nếu sản phẩm chưa đăng ký on-chain. */
  readProduct(chainProductId: string): Promise<OnchainProduct | null>;
}

export const PRODUCT_CHAIN = Symbol('PRODUCT_CHAIN');

/** Sinh mã QR công khai ngẫu nhiên. */
export interface PublicCodeGenerator {
  next(): string;
}

export const PUBLIC_CODE_GENERATOR = Symbol('PUBLIC_CODE_GENERATOR');
