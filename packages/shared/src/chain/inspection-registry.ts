import { type TypedDataDomain, TypedDataEncoder, type TypedDataField } from 'ethers';

/*
 * Giấy phép (EIP-712) ghi kết quả kiểm định (M8). Phải khớp TYPEHASH và tên/phiên bản EIP-712 trong
 * `InspectionRegistry.sol`.
 */

export const INSPECTION_REGISTRY_CONTRACT_NAME = 'InspectionRegistry';

export const INSPECTION_EIP712_NAME = 'DPP InspectionRegistry';

export const INSPECTION_EIP712_VERSION = '1';

/** Hàm ghi của đơn vị kiểm định (INS-01). */
export const INSPECTOR_METHODS = ['recordInspection'] as const;

export const INSPECTION_RECORD_PRIMARY_TYPE = 'InspectionRecord';

export const INSPECTION_RECORD_TYPES: Record<string, TypedDataField[]> = {
  [INSPECTION_RECORD_PRIMARY_TYPE]: [
    { name: 'inspectionId', type: 'bytes32' },
    { name: 'productId', type: 'bytes32' },
    { name: 'inspectorId', type: 'bytes32' },
    { name: 'requesterId', type: 'bytes32' },
    { name: 'result', type: 'uint8' },
    { name: 'reportHash', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/**
 * Giấy phép INS-01: `requesterId` đã gửi yêu cầu `inspectionId` cho sản phẩm `productId` tới đơn
 * vị `inspectorId`, và máy chủ đã lưu biên bản có hash `reportHash` với kết quả `result` (uint8
 * theo enum InspectionResult on-chain). Mỗi inspectionId chỉ ghi được một lần.
 */
export interface InspectionRecord {
  inspectionId: string;
  productId: string;
  inspectorId: string;
  requesterId: string;
  result: number;
  reportHash: string;
  deadline: bigint;
}

export function inspectionDomain(chainId: number, verifyingContract: string): TypedDataDomain {
  return {
    name: INSPECTION_EIP712_NAME,
    version: INSPECTION_EIP712_VERSION,
    chainId,
    verifyingContract,
  };
}

/** Digest EIP-712 của giấy phép, bằng đúng `inspectionRecordDigest()` của contract. */
export function inspectionRecordDigest(
  chainId: number,
  verifyingContract: string,
  record: InspectionRecord,
): string {
  return TypedDataEncoder.hash(
    inspectionDomain(chainId, verifyingContract),
    INSPECTION_RECORD_TYPES,
    { ...record },
  );
}
