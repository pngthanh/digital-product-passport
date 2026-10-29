import { type TypedDataDomain, TypedDataEncoder, type TypedDataField } from 'ethers';

/*
 * Giấy phép (EIP-712) mà backend ký để ví của người đại diện nhà sản xuất tự gửi registerProducts.
 * Phải khớp PRODUCT_REGISTRATION_TYPEHASH và tên/phiên bản EIP-712 trong `ProductPassport.sol`.
 */

export const PRODUCT_PASSPORT_CONTRACT_NAME = 'ProductPassport';

export const PRODUCT_PASSPORT_EIP712_NAME = 'DPP ProductPassport';

export const PRODUCT_PASSPORT_EIP712_VERSION = '1';

export type ProductPassportMethod = 'registerProducts';

export const PRODUCT_REGISTRATION_PRIMARY_TYPE = 'ProductRegistration';

export const PRODUCT_REGISTRATION_TYPES: Record<string, TypedDataField[]> = {
  [PRODUCT_REGISTRATION_PRIMARY_TYPE]: [
    { name: 'issuerId', type: 'bytes32' },
    { name: 'productIds', type: 'bytes32[]' },
    { name: 'metadataHashes', type: 'bytes32[]' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/** Giấy phép: nhà sản xuất `issuerId` đăng ký các sản phẩm `productIds` với hồ sơ `metadataHashes`. */
export interface ProductRegistration {
  issuerId: string;
  productIds: string[];
  metadataHashes: string[];
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

/** Digest EIP-712 của giấy phép, bằng đúng `productRegistrationDigest()` của contract. */
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
