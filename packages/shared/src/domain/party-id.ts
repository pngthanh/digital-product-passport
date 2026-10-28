import { isBytes32Hex } from '../utils/hash.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 16 byte cao của partyId luôn bằng 0 vì UUID chỉ dài 16 byte. */
const PARTY_ID_HIGH_HALF = '0'.repeat(32);

export class InvalidPartyIdError extends Error {
  constructor(value: string) {
    super(`partyId không hợp lệ: ${value}`);
    this.name = 'InvalidPartyIdError';
  }
}

/**
 * partyId on-chain (bytes32) suy ra từ UUID của dòng `parties`: UUID nằm ở 16 byte thấp.
 * Ánh xạ hai chiều nên Indexer tìm đúng dòng `parties` từ event mà không cần tra thêm bảng.
 */
export function partyIdFromUuid(uuid: string): string {
  if (!UUID_PATTERN.test(uuid)) {
    throw new InvalidPartyIdError(uuid);
  }
  return `0x${PARTY_ID_HIGH_HALF}${uuid.replaceAll('-', '').toLowerCase()}`;
}

/** Ngược lại của `partyIdFromUuid`; báo lỗi nếu bytes32 không do hệ thống sinh ra. */
export function uuidFromPartyId(partyId: string): string {
  const hex = partyId.toLowerCase();
  if (!isBytes32Hex(hex) || !hex.startsWith(`0x${PARTY_ID_HIGH_HALF}`)) {
    throw new InvalidPartyIdError(partyId);
  }
  const low = hex.slice(2 + PARTY_ID_HIGH_HALF.length);
  return [
    low.slice(0, 8),
    low.slice(8, 12),
    low.slice(12, 16),
    low.slice(16, 20),
    low.slice(20),
  ].join('-');
}
