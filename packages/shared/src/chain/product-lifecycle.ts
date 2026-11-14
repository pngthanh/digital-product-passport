import { type TypedDataDomain, TypedDataEncoder, type TypedDataField } from 'ethers';

/*
 * Giấy phép (EIP-712) thu hồi sản phẩm (M10). Phải khớp TYPEHASH và tên/phiên bản EIP-712 trong
 * `ProductLifecycle.sol`.
 */

export const PRODUCT_LIFECYCLE_CONTRACT_NAME = 'ProductLifecycle';

export const LIFECYCLE_EIP712_NAME = 'DPP ProductLifecycle';

export const LIFECYCLE_EIP712_VERSION = '1';

/** Hàm ghi của ProductLifecycle: thu hồi (nhà sản xuất), báo mất và ngừng sử dụng (chủ sở hữu). */
export const PRODUCT_LIFECYCLE_METHODS = [
  'recallProducts',
  'reportLostStolen',
  'retireProduct',
] as const;
export type ProductLifecycleMethod = (typeof PRODUCT_LIFECYCLE_METHODS)[number];

/** Hai thao tác của chủ sở hữu (LIF-01, LIF-02), cùng một giao dịch không cần giấy phép. */
export const OWNER_LIFECYCLE_METHODS = ['reportLostStolen', 'retireProduct'] as const;
export type OwnerLifecycleMethod = (typeof OWNER_LIFECYCLE_METHODS)[number];

/** Số sản phẩm tối đa mỗi lần thu hồi, bằng `ProductLifecycle.MAX_BATCH_SIZE`. */
export const RECALL_MAX_BATCH_SIZE = 50;

export const RECALL_AUTHORIZATION_PRIMARY_TYPE = 'RecallAuthorization';

export const RECALL_AUTHORIZATION_TYPES: Record<string, TypedDataField[]> = {
  [RECALL_AUTHORIZATION_PRIMARY_TYPE]: [
    { name: 'issuerId', type: 'bytes32' },
    { name: 'productIds', type: 'bytes32[]' },
    { name: 'reasonHash', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/**
 * Giấy phép RCL-01: nhà sản xuất `issuerId` thu hồi các sản phẩm `productIds` với lý do có hash
 * `reasonHash` đã lưu trong hệ thống.
 */
export interface RecallAuthorization {
  issuerId: string;
  productIds: string[];
  reasonHash: string;
  deadline: bigint;
}

export function lifecycleDomain(chainId: number, verifyingContract: string): TypedDataDomain {
  return {
    name: LIFECYCLE_EIP712_NAME,
    version: LIFECYCLE_EIP712_VERSION,
    chainId,
    verifyingContract,
  };
}

/** Digest EIP-712 của giấy phép, bằng đúng `recallAuthorizationDigest()` của contract. */
export function recallAuthorizationDigest(
  chainId: number,
  verifyingContract: string,
  authorization: RecallAuthorization,
): string {
  return TypedDataEncoder.hash(
    lifecycleDomain(chainId, verifyingContract),
    RECALL_AUTHORIZATION_TYPES,
    { ...authorization },
  );
}
