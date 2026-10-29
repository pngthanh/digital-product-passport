/*
 * Mã công khai in trên tem QR của từng sản phẩm. Mã ngẫu nhiên (không suy ra từ serial) để không ai
 * dò được hộ chiếu của sản phẩm khác; bảng chữ bỏ I, O, 0, 1 cho dễ đọc khi gõ tay.
 */

export const PUBLIC_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PUBLIC_CODE_LENGTH = 12;
export const PUBLIC_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/;

/** Đường dẫn trang hộ chiếu công khai mà mã QR trỏ tới. */
export function passportPath(publicCode: string): string {
  return `/p/${publicCode}`;
}

/** Hiển thị mã theo nhóm 4 ký tự (ABCD-EFGH-JKLM) cho dễ đọc trên tem. */
export function formatPublicCode(publicCode: string): string {
  return publicCode.match(/.{1,4}/g)?.join('-') ?? publicCode;
}

/**
 * Lấy mã công khai từ nội dung người dùng gõ hoặc quét được: mã trần, mã có dấu gạch/khoảng trắng,
 * hoặc đường dẫn `.../p/<mã>`. Trả `null` nếu không phải mã hợp lệ.
 */
export function extractPublicCode(input: string): string | null {
  const text = input.trim();
  const fromPath = /\/p\/([A-Za-z0-9-]+)\/?(?:[?#].*)?$/.exec(text)?.[1] ?? text;
  const code = fromPath.replace(/[\s-]/g, '').toUpperCase();
  return PUBLIC_CODE_PATTERN.test(code) ? code : null;
}
