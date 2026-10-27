import { describe, expect, it } from 'vitest';
import {
  InvalidAddressError,
  NORMALIZED_ADDRESS_PATTERN,
  normalizeAddress,
  shortenHex,
  toChecksumAddress,
} from './address.js';

const CHECKSUM = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

describe('normalizeAddress', () => {
  it('đưa địa chỉ checksum về chữ thường để lưu CSDL', () => {
    const normalized = normalizeAddress(CHECKSUM);
    expect(normalized).toBe(CHECKSUM.toLowerCase());
    expect(NORMALIZED_ADDRESS_PATTERN.test(normalized)).toBe(true);
  });

  it('chấp nhận địa chỉ toàn chữ thường và bỏ khoảng trắng thừa', () => {
    expect(normalizeAddress(`  ${CHECKSUM.toLowerCase()} `)).toBe(CHECKSUM.toLowerCase());
  });

  it('từ chối địa chỉ sai checksum EIP-55', () => {
    const wrongChecksum = CHECKSUM.replace('aAeb', 'AAeb');
    expect(() => normalizeAddress(wrongChecksum)).toThrow(InvalidAddressError);
  });

  it('từ chối chuỗi không phải địa chỉ', () => {
    expect(() => normalizeAddress('0x1234')).toThrow(InvalidAddressError);
  });
});

describe('toChecksumAddress', () => {
  it('trả về dạng hiển thị EIP-55', () => {
    expect(toChecksumAddress(CHECKSUM.toLowerCase())).toBe(CHECKSUM);
  });
});

describe('shortenHex', () => {
  it('rút gọn chuỗi dài', () => {
    expect(shortenHex(CHECKSUM)).toBe('0x5aAe…eAed');
  });

  it('giữ nguyên chuỗi ngắn', () => {
    expect(shortenHex('0x1234')).toBe('0x1234');
  });
});
