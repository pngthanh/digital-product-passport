/*
 * Quy tắc tài khoản dùng chung cho API (kiểm tra thật) và Web (báo lỗi sớm trên form).
 * Mật khẩu theo NIST SP 800-63B: chỉ giới hạn độ dài, không ép tổ hợp ký tự.
 */

export const PASSWORD_MIN_LENGTH = 8;

/** Giới hạn trên chặn tấn công từ chối dịch vụ bằng chuỗi rất dài đưa vào Argon2id. */
export const PASSWORD_MAX_LENGTH = 128;

export const EMAIL_MAX_LENGTH = 255;

export const FULL_NAME_MAX_LENGTH = 255;
