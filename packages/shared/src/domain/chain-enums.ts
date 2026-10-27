/*
 * Thứ tự giá trị enum on-chain (uint8) — phải khớp 1-1 với
 * `packages/contracts/contracts/shared/DppTypes.sol`. Phần tử 0 luôn là NONE,
 * là giá trị mặc định của mapping trong Solidity ("chưa tồn tại").
 * Test `dpp-types.test.ts` trong package contracts kiểm tra sự khớp này.
 */

export const CHAIN_NONE = 'NONE';

export const CHAIN_ENUM_ORDER = {
  PartyKind: ['NONE', 'USER', 'ORGANIZATION'],
  OrganizationStatus: ['NONE', 'PENDING', 'AUTHORIZED', 'REJECTED', 'DISABLED'],
  FeeStatus: ['NONE', 'ESCROWED', 'SETTLED', 'REFUNDABLE', 'REFUNDED'],
  ProductState: [
    'NONE',
    'CREATED',
    'IN_DISTRIBUTION',
    'AT_RETAIL',
    'SOLD',
    'RECALLED',
    'LOST_STOLEN',
    'RETIRED',
  ],
  WarrantyState: ['NONE', 'ACTIVE', 'SUSPENDED', 'EXPIRED'],
  ServiceTicketState: ['NONE', 'IN_REPAIR', 'REPAIRED', 'REJECTED'],
  InspectionResult: ['NONE', 'PASS', 'FAIL', 'CONDITIONAL'],
  TransferState: ['NONE', 'REQUESTED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
} as const;

export type ChainEnumName = keyof typeof CHAIN_ENUM_ORDER;
export type ChainEnumValue<N extends ChainEnumName> = (typeof CHAIN_ENUM_ORDER)[N][number];

export class ChainEnumDecodeError extends Error {
  constructor(enumName: ChainEnumName, ordinal: number) {
    super(`Giá trị ${ordinal} không thuộc enum on-chain ${enumName}`);
    this.name = 'ChainEnumDecodeError';
  }
}

/**
 * Giải mã giá trị uint8 đọc từ event/contract thành tên trạng thái.
 * Trả về `null` với NONE để phía gọi phân biệt rõ "chưa tồn tại".
 */
export function decodeChainEnum<N extends ChainEnumName>(
  enumName: N,
  ordinal: number | bigint,
): Exclude<ChainEnumValue<N>, typeof CHAIN_NONE> | null {
  const index = Number(ordinal);
  const order: readonly string[] = CHAIN_ENUM_ORDER[enumName];
  const value = Number.isInteger(index) ? order[index] : undefined;
  if (value === undefined) {
    throw new ChainEnumDecodeError(enumName, index);
  }
  if (value === CHAIN_NONE) {
    return null;
  }
  return value as Exclude<ChainEnumValue<N>, typeof CHAIN_NONE>;
}

/** Mã hoá tên trạng thái thành uint8 để gọi contract. */
export function encodeChainEnum<N extends ChainEnumName>(
  enumName: N,
  value: ChainEnumValue<N>,
): number {
  const order: readonly string[] = CHAIN_ENUM_ORDER[enumName];
  return order.indexOf(value);
}
