import { describe, expect, it } from 'vitest';
import { partyIdFromUuid } from './party-id.js';
import {
  normalizeManufacturedOn,
  normalizeSerialNumber,
  productIdOf,
  productMetadataHash,
  type ProductMetadata,
  SERIAL_NUMBER_PATTERN,
  todayInVietnam,
} from './product-metadata.js';
import { extractPublicCode, formatPublicCode, PUBLIC_CODE_PATTERN } from './public-code.js';

const MAKER = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000a1');
const OTHER_MAKER = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000a2');

const METADATA: ProductMetadata = {
  issuerPartyId: MAKER,
  serialNumber: 'ABC-2026-000128',
  modelName: 'Laptop ABC Pro 14',
  description: null,
  manufacturedOn: '2026-10-01',
  warrantyMonths: 24,
};

describe('Hồ sơ sản phẩm', () => {
  it('serial so khớp không phân biệt hoa thường và chỉ nhận ký tự an toàn', () => {
    expect(normalizeSerialNumber('  abc-2026-000128 ')).toBe('ABC-2026-000128');
    expect(SERIAL_NUMBER_PATTERN.test('ABC-2026-000128')).toBe(true);
    expect(SERIAL_NUMBER_PATTERN.test('SN/2026.01_A')).toBe(true);
    expect(SERIAL_NUMBER_PATTERN.test('ABC 2026')).toBe(false);
    expect(SERIAL_NUMBER_PATTERN.test('-ABC')).toBe(false);
  });

  it('ngày sản xuất nhận YYYY-MM-DD và DD/MM/YYYY của Excel, bỏ ngày không tồn tại', () => {
    expect(normalizeManufacturedOn('2026-10-01')).toBe('2026-10-01');
    expect(normalizeManufacturedOn('1/10/2026')).toBe('2026-10-01');
    expect(normalizeManufacturedOn('31/02/2026')).toBeNull();
    expect(normalizeManufacturedOn('2026/10/01')).toBeNull();
    expect(normalizeManufacturedOn('')).toBeNull();
  });

  it('ngày hôm nay tính theo giờ Việt Nam', () => {
    expect(todayInVietnam(new Date('2026-10-29T18:30:00Z'))).toBe('2026-10-30');
    expect(todayInVietnam(new Date('2026-10-29T16:59:00Z'))).toBe('2026-10-29');
  });

  it('productId phụ thuộc nhà sản xuất: hai hãng trùng serial vẫn khác productId', () => {
    const id = productIdOf(MAKER, 'ABC-2026-000128');

    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(productIdOf(MAKER, 'ABC-2026-000128')).toBe(id);
    expect(productIdOf(OTHER_MAKER, 'ABC-2026-000128')).not.toBe(id);
  });

  it('hash hồ sơ ổn định; đổi bất kỳ trường nào thì hash đổi', () => {
    const hash = productMetadataHash(METADATA);

    expect(productMetadataHash({ ...METADATA })).toBe(hash);
    for (const change of [
      { serialNumber: 'ABC-2026-000129' },
      { modelName: 'Laptop ABC Pro 16' },
      { description: 'Màu bạc' },
      { manufacturedOn: '2026-10-02' },
      { warrantyMonths: 12 },
      { issuerPartyId: OTHER_MAKER },
    ]) {
      expect(productMetadataHash({ ...METADATA, ...change })).not.toBe(hash);
    }
  });
});

describe('Mã QR công khai', () => {
  it('đọc mã từ mã trần, mã có gạch nối hoặc đường dẫn quét được', () => {
    expect(extractPublicCode('K7M2PQ9XRT4W')).toBe('K7M2PQ9XRT4W');
    expect(extractPublicCode('k7m2-pq9x-rt4w')).toBe('K7M2PQ9XRT4W');
    expect(extractPublicCode('http://localhost:3000/p/K7M2PQ9XRT4W')).toBe('K7M2PQ9XRT4W');
    expect(extractPublicCode('https://dpp.example.vn/p/K7M2PQ9XRT4W?ref=tem')).toBe('K7M2PQ9XRT4W');
  });

  it('từ chối mã sai độ dài hoặc có ký tự dễ nhầm (I, O, 0, 1)', () => {
    expect(extractPublicCode('K7M2PQ9XRT4')).toBeNull();
    expect(extractPublicCode('K7M2PQ9XRT40')).toBeNull();
    expect(extractPublicCode('http://localhost:3000/products')).toBeNull();
    expect(PUBLIC_CODE_PATTERN.test('IOIOIOIOIOIO')).toBe(false);
  });

  it('hiển thị theo nhóm 4 ký tự', () => {
    expect(formatPublicCode('K7M2PQ9XRT4W')).toBe('K7M2-PQ9X-RT4W');
  });
});
