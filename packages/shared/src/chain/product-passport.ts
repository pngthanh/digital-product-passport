import { type TypedDataDomain, TypedDataEncoder, type TypedDataField } from 'ethers';

/*
 * Giấy phép (EIP-712) mà backend ký để ví của người đại diện tự gửi giao dịch lên ProductPassport.
 * Phải khớp các TYPEHASH và tên/phiên bản EIP-712 trong `ProductPassport.sol` (phiên bản 2, M6).
 */

export const PRODUCT_PASSPORT_CONTRACT_NAME = 'ProductPassport';

export const PRODUCT_PASSPORT_EIP712_NAME = 'DPP ProductPassport';

export const PRODUCT_PASSPORT_EIP712_VERSION = '2';

/** Hàm ghi của nhà sản xuất (M5, DST-01) và của nhà bán lẻ (DST-02, DST-03). */
export const MANUFACTURER_PASSPORT_METHODS = [
  'registerProducts',
  'dispatchCustody',
  'cancelDispatch',
] as const;
export const RETAILER_PASSPORT_METHODS = [
  'confirmCustodyReceipt',
  'rejectCustodyReceipt',
  'sellAndActivateWarranty',
] as const;

export type ProductPassportMethod =
  (typeof MANUFACTURER_PASSPORT_METHODS)[number] | (typeof RETAILER_PASSPORT_METHODS)[number];

export const PRODUCT_REGISTRATION_PRIMARY_TYPE = 'ProductRegistration';

export const PRODUCT_REGISTRATION_TYPES: Record<string, TypedDataField[]> = {
  [PRODUCT_REGISTRATION_PRIMARY_TYPE]: [
    { name: 'issuerId', type: 'bytes32' },
    { name: 'productIds', type: 'bytes32[]' },
    { name: 'metadataHashes', type: 'bytes32[]' },
    { name: 'warrantyMonths', type: 'uint16[]' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/**
 * Giấy phép: nhà sản xuất `issuerId` đăng ký các sản phẩm `productIds` với hồ sơ `metadataHashes`
 * và số tháng bảo hành `warrantyMonths` (khoá on-chain để nhà bán lẻ không đổi được).
 */
export interface ProductRegistration {
  issuerId: string;
  productIds: string[];
  metadataHashes: string[];
  warrantyMonths: number[];
  deadline: bigint;
}

export const PRODUCT_SALE_PRIMARY_TYPE = 'ProductSale';

export const PRODUCT_SALE_TYPES: Record<string, TypedDataField[]> = {
  [PRODUCT_SALE_PRIMARY_TYPE]: [
    { name: 'productId', type: 'bytes32' },
    { name: 'retailerId', type: 'bytes32' },
    { name: 'buyerId', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/** Giấy phép DST-03: nhà bán lẻ `retailerId` bán `productId` cho tài khoản có partyId `buyerId`. */
export interface ProductSale {
  productId: string;
  retailerId: string;
  buyerId: string;
  deadline: bigint;
}

export function productPassportDomain(chainId: number, verifyingContract: string): TypedDataDomain {
  return {
    name: PRODUCT_PASSPORT_EIP712_NAME,
    version: PRODUCT_PASSPORT_EIP712_VERSION,
    chainId,
    verifyingContract,
  };
}

/** Digest EIP-712 của giấy phép đăng ký, bằng đúng `productRegistrationDigest()` của contract. */
export function productRegistrationDigest(
  chainId: number,
  verifyingContract: string,
  registration: ProductRegistration,
): string {
  return TypedDataEncoder.hash(
    productPassportDomain(chainId, verifyingContract),
    PRODUCT_REGISTRATION_TYPES,
    { ...registration },
  );
}

/** Digest EIP-712 của giấy phép bán, bằng đúng `productSaleDigest()` của contract. */
export function productSaleDigest(
  chainId: number,
  verifyingContract: string,
  sale: ProductSale,
): string {
  return TypedDataEncoder.hash(
    productPassportDomain(chainId, verifyingContract),
    PRODUCT_SALE_TYPES,
    {
      ...sale,
    },
  );
}
