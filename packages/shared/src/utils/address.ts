import { getAddress } from 'ethers';

/** Địa chỉ EVM hợp lệ, không phân biệt hoa/thường. */
export const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/** Dạng lưu trong CSDL: chữ thường, khớp CHECK `^0x[0-9a-f]{40}$`. */
export const NORMALIZED_ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;

export class InvalidAddressError extends Error {
  constructor(value: string) {
    super(`Địa chỉ EVM không hợp lệ: ${value}`);
    this.name = 'InvalidAddressError';
  }
}

export function isEvmAddress(value: string): boolean {
  return EVM_ADDRESS_PATTERN.test(value);
}

/**
 * Chuẩn hoá địa chỉ về chữ thường trước khi lưu hoặc so sánh UNIQUE.
 * Địa chỉ có chữ hoa phải đúng checksum EIP-55, tránh nhận nhầm địa chỉ gõ sai.
 */
export function normalizeAddress(value: string): string {
  const trimmed = value.trim();
  if (!isEvmAddress(trimmed)) {
    throw new InvalidAddressError(value);
  }
  try {
    return getAddress(trimmed).toLowerCase();
  } catch {
    throw new InvalidAddressError(value);
  }
}

/** Dạng hiển thị theo checksum EIP-55. */
export function toChecksumAddress(value: string): string {
  return getAddress(normalizeAddress(value));
}

/** Rút gọn chuỗi hex dài để hiển thị, ví dụ `0x12ab…9fe0`. */
export function shortenHex(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
