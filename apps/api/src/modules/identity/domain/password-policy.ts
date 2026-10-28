import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@dpp/shared';

const GRAPHEMES = new Intl.Segmenter('vi', { granularity: 'grapheme' });

/**
 * Kiểm tra mật khẩu theo NIST SP 800-63B: giới hạn độ dài, không trùng email.
 * Trả về thông báo lỗi tiếng Việt, hoặc `null` nếu hợp lệ.
 */
export function findPasswordPolicyViolation(password: string, email: string): string | null {
  // Đếm theo ký tự người dùng nhìn thấy (grapheme), tiếng Việt có dấu hay emoji đều tính 1.
  const length = [...GRAPHEMES.segment(password)].length;
  if (length < PASSWORD_MIN_LENGTH) {
    return `Mật khẩu cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`;
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự.`;
  }
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) {
    return 'Mật khẩu không được trùng với email.';
  }
  return null;
}
