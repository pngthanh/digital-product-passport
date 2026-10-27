import { describe, expect, it } from 'vitest';
import { InvalidBytes32Error, isBytes32Hex, normalizeBytes32 } from './hash.js';

const TX_HASH = `0x${'AB'.repeat(32)}`;

describe('normalizeBytes32', () => {
  it('chuẩn hoá về chữ thường', () => {
    expect(normalizeBytes32(TX_HASH)).toBe(TX_HASH.toLowerCase());
  });

  it('từ chối giá trị sai độ dài', () => {
    expect(() => normalizeBytes32('0xabcd')).toThrow(InvalidBytes32Error);
    expect(isBytes32Hex(`${TX_HASH}00`)).toBe(false);
  });
});
