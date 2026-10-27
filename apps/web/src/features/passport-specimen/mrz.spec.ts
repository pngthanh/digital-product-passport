import { describe, expect, it } from 'vitest';
import { buildProductMrz, MRZ_LINE_LENGTH, mrzCheckDigit, toMrzText } from './mrz';

describe('MRZ', () => {
  it('tính chữ số kiểm tra đúng ví dụ chuẩn ICAO 9303', () => {
    expect(mrzCheckDigit('L898902C3')).toBe(6);
    expect(mrzCheckDigit('690806')).toBe(1);
    expect(mrzCheckDigit('940623')).toBe(6);
  });

  it('bỏ dấu tiếng Việt và ký tự đặc biệt', () => {
    expect(toMrzText('Trung tâm bảo hành Đà Nẵng')).toBe('TRUNG<TAM<BAO<HANH<DA<NANG');
  });

  it('mỗi dòng đúng 44 ký tự hợp lệ', () => {
    const lines = buildProductMrz({
      issuer: 'ABC Electronics',
      model: 'Laptop ABC Pro 14',
      serial: 'ABC-2026-000128',
      chainId: 10143,
      state: 'SOLD',
    });

    for (const line of lines) {
      expect(line).toHaveLength(MRZ_LINE_LENGTH);
      expect(line).toMatch(/^[A-Z0-9<]+$/);
    }
    expect(lines[1].startsWith(`ABC2026000128${mrzCheckDigit('ABC2026000128')}<MONAD10143`)).toBe(
      true,
    );
  });
});
