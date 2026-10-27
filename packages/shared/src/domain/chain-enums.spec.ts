import { describe, expect, it } from 'vitest';
import { ChainEnumDecodeError, decodeChainEnum, encodeChainEnum } from './chain-enums.js';

describe('enum on-chain', () => {
  it('giải mã uint8 thành tên trạng thái', () => {
    expect(decodeChainEnum('ProductState', 4)).toBe('SOLD');
    expect(decodeChainEnum('TransferState', 1n)).toBe('REQUESTED');
  });

  it('NONE được giải mã thành null', () => {
    expect(decodeChainEnum('WarrantyState', 0)).toBeNull();
  });

  it('báo lỗi với giá trị ngoài phạm vi', () => {
    expect(() => decodeChainEnum('TransferState', 99)).toThrow(ChainEnumDecodeError);
    expect(() => decodeChainEnum('TransferState', 1.5)).toThrow(ChainEnumDecodeError);
  });

  it('mã hoá và giải mã là hai chiều', () => {
    expect(decodeChainEnum('ProductState', encodeChainEnum('ProductState', 'RECALLED'))).toBe(
      'RECALLED',
    );
  });
});
