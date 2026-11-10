import { type TypedDataDomain, TypedDataEncoder, type TypedDataField } from 'ethers';

/*
 * Giấy phép (EIP-712) tạo yêu cầu chuyển nhượng (M9). Phải khớp TYPEHASH và tên/phiên bản EIP-712
 * trong `OwnershipTransfer.sol`.
 */

export const OWNERSHIP_TRANSFER_CONTRACT_NAME = 'OwnershipTransfer';

export const TRANSFER_EIP712_NAME = 'DPP OwnershipTransfer';

export const TRANSFER_EIP712_VERSION = '1';

/** Các hàm ghi của OwnershipTransfer mà người dùng gửi (TRF-01..05). */
export const OWNERSHIP_TRANSFER_METHODS = [
  'createTransferRequest',
  'cancelTransfer',
  'acceptTransfer',
  'rejectTransfer',
  'expireTransfer',
] as const;
export type OwnershipTransferMethod = (typeof OWNERSHIP_TRANSFER_METHODS)[number];

/** Thời hạn một yêu cầu: 1 đến 30 ngày (contract chặn trên ở 30 ngày). */
export const TRANSFER_MIN_DAYS = 1;
export const TRANSFER_MAX_DAYS = 30;
export const TRANSFER_DEFAULT_DAYS = 7;

export const TRANSFER_AUTHORIZATION_PRIMARY_TYPE = 'TransferAuthorization';

export const TRANSFER_AUTHORIZATION_TYPES: Record<string, TypedDataField[]> = {
  [TRANSFER_AUTHORIZATION_PRIMARY_TYPE]: [
    { name: 'productId', type: 'bytes32' },
    { name: 'fromPartyId', type: 'bytes32' },
    { name: 'toPartyId', type: 'bytes32' },
    { name: 'expiresAt', type: 'uint64' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/**
 * Giấy phép TRF-01: chủ sở hữu `fromPartyId` được tạo yêu cầu chuyển sản phẩm `productId` cho
 * `toPartyId` (tài khoản có thật trong hệ thống), hết hạn lúc `expiresAt` (giây Unix).
 */
export interface TransferAuthorization {
  productId: string;
  fromPartyId: string;
  toPartyId: string;
  expiresAt: bigint;
  deadline: bigint;
}

export function transferDomain(chainId: number, verifyingContract: string): TypedDataDomain {
  return {
    name: TRANSFER_EIP712_NAME,
    version: TRANSFER_EIP712_VERSION,
    chainId,
    verifyingContract,
  };
}

/** Digest EIP-712 của giấy phép, bằng đúng `transferAuthorizationDigest()` của contract. */
export function transferAuthorizationDigest(
  chainId: number,
  verifyingContract: string,
  authorization: TransferAuthorization,
): string {
  return TypedDataEncoder.hash(
    transferDomain(chainId, verifyingContract),
    TRANSFER_AUTHORIZATION_TYPES,
    { ...authorization },
  );
}
