import { AbiCoder, keccak256, toUtf8Bytes } from 'ethers';

/*
 * Hồ sơ sản phẩm (PRD-01, PRD-02) dùng chung cho API (kiểm tra thật) và Web (báo lỗi sớm, đọc CSV).
 * Hash hồ sơ được ghi lên ProductPassport, nên hai phía phải chuẩn hoá và băm giống hệt.
 */

/** Serial: chữ, số và `-_./`, bắt đầu và kết thúc bằng chữ hoặc số; lưu chữ in hoa. */
export const SERIAL_NUMBER_PATTERN = /^[A-Z0-9](?:[A-Z0-9._/-]{0,98}[A-Z0-9])?$/;
export const SERIAL_NUMBER_MAX_LENGTH = 100;
export const MODEL_NAME_MAX_LENGTH = 255;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 2000;
export const WARRANTY_MONTHS_MAX = 120;
/** Ngày sản xuất sớm nhất chấp nhận được. */
export const MANUFACTURED_ON_MIN = '1990-01-01';
/** Khớp `ProductPassport.MAX_BATCH_SIZE`: số sản phẩm tối đa mỗi giao dịch (mỗi lô CSV). */
export const PRODUCT_BATCH_MAX_SIZE = 50;

export interface ProductMetadata {
  /** partyId (bytes32) của nhà sản xuất phát hành. */
  issuerPartyId: string;
  serialNumber: string;
  modelName: string;
  description: string | null;
  /** YYYY-MM-DD. */
  manufacturedOn: string;
  /** 0 là không bảo hành. */
  warrantyMonths: number;
}

/** Serial so khớp không phân biệt hoa thường: bỏ khoảng trắng hai đầu, chuyển chữ in hoa. */
export function normalizeSerialNumber(serial: string): string {
  return serial.trim().toUpperCase();
}

/** Bỏ khoảng trắng thừa; chuỗi rỗng thành `null`. */
export function normalizeText(value: string | null | undefined): string | null {
  const text = value?.trim().replace(/\s+/g, ' ') ?? '';
  return text === '' ? null : text;
}

/**
 * Ngày sản xuất về dạng YYYY-MM-DD; nhận cả DD/MM/YYYY (Excel tiếng Việt lưu CSV theo dạng này).
 * Trả `null` nếu không phải ngày hợp lệ.
 */
export function normalizeManufacturedOn(value: string): string | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const vn = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : vn
      ? [Number(vn[3]), Number(vn[2]), Number(vn[1])]
      : [Number.NaN, Number.NaN, Number.NaN];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD, để chặn ngày sản xuất ở tương lai. */
export function todayInVietnam(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** productId on-chain = keccak256(abi.encode(issuerPartyId, serial)): serial chỉ cần duy nhất trong một nhà sản xuất. */
export function productIdOf(issuerPartyId: string, serialNumber: string): string {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(['bytes32', 'string'], [issuerPartyId, serialNumber]),
  );
}

/** keccak256 của JSON hồ sơ với thứ tự khoá cố định; đổi bất kỳ trường nào thì hash đổi. */
export function productMetadataHash(metadata: ProductMetadata): string {
  const canonical = JSON.stringify({
    version: 1,
    issuerPartyId: metadata.issuerPartyId.toLowerCase(),
    serialNumber: metadata.serialNumber,
    modelName: metadata.modelName,
    description: metadata.description,
    manufacturedOn: metadata.manufacturedOn,
    warrantyMonths: metadata.warrantyMonths,
  });
  return keccak256(toUtf8Bytes(canonical));
}
