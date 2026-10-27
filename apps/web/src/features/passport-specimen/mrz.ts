/*
 * Dải MRZ (Machine Readable Zone) theo bố cục hộ chiếu ICAO 9303: 2 dòng × 44 ký tự,
 * chỉ gồm A–Z, 0–9 và ký tự đệm "<". Chữ số kiểm tra dùng trọng số 7-3-1.
 */

export const MRZ_LINE_LENGTH = 44;
const FILLER = '<';
const CHECK_WEIGHTS = [7, 3, 1] as const;

/** Bỏ dấu tiếng Việt, viết hoa, thay ký tự khác chữ/số bằng "<". */
export function toMrzText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, FILLER)
    .replace(/^<+|<+$/g, '');
}

export function padMrzLine(value: string): string {
  return value.slice(0, MRZ_LINE_LENGTH).padEnd(MRZ_LINE_LENGTH, FILLER);
}

function characterValue(character: string): number {
  if (character === FILLER) {
    return 0;
  }
  if (/^[0-9]$/.test(character)) {
    return Number(character);
  }
  if (/^[A-Z]$/.test(character)) {
    return character.charCodeAt(0) - 55;
  }
  throw new Error(`Ký tự không hợp lệ trong MRZ: ${character}`);
}

/** Chữ số kiểm tra ICAO 9303: tổng (giá trị × trọng số 7,3,1 lặp lại) mod 10. */
export function mrzCheckDigit(value: string): number {
  let sum = 0;
  for (const [index, character] of [...value].entries()) {
    sum += characterValue(character) * CHECK_WEIGHTS[index % CHECK_WEIGHTS.length]!;
  }
  return sum % 10;
}

export interface ProductMrzInput {
  issuer: string;
  model: string;
  serial: string;
  chainId: number;
  state: string;
}

/** Dòng 1: loại hồ sơ, quốc gia, nhà phát hành, mẫu máy. Dòng 2: serial + chữ số kiểm tra, mạng, trạng thái. */
export function buildProductMrz({
  issuer,
  model,
  serial,
  chainId,
  state,
}: ProductMrzInput): [string, string] {
  const serialField = toMrzText(serial).replaceAll(FILLER, '');
  return [
    padMrzLine(`PD${FILLER}VNM${toMrzText(issuer)}${FILLER}${FILLER}${toMrzText(model)}`),
    padMrzLine(
      `${serialField}${mrzCheckDigit(serialField)}${FILLER}MONAD${chainId}${FILLER}${FILLER}${toMrzText(state)}`,
    ),
  ];
}
