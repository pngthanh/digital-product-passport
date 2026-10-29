import { PUBLIC_CODE_LENGTH } from '@dpp/shared';

/** Hướng dẫn khi mã gõ vào không đúng định dạng (dùng ở cả form và trang server). */
export const CODE_FORMAT_HINT = `Mã gồm ${PUBLIC_CODE_LENGTH} ký tự in trên tem (ví dụ K7M2-PQ9X-RT4W), không có chữ I, O và số 0, 1.`;
