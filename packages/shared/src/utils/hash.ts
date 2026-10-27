/** bytes32 dạng hex (tx hash, block hash, evidence hash…), khớp CHECK `^0x[0-9a-f]{64}$`. */
export const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export class InvalidBytes32Error extends Error {
  constructor(value: string) {
    super(`Giá trị bytes32 không hợp lệ: ${value}`);
    this.name = 'InvalidBytes32Error';
  }
}

export function isBytes32Hex(value: string): boolean {
  return BYTES32_PATTERN.test(value);
}

/** Chuẩn hoá bytes32 về chữ thường trước khi lưu. */
export function normalizeBytes32(value: string): string {
  const trimmed = value.trim();
  if (!isBytes32Hex(trimmed)) {
    throw new InvalidBytes32Error(value);
  }
  return trimmed.toLowerCase();
}
