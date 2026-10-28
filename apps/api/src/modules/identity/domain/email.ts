/** Email lưu chữ thường (khớp CHECK ck_users_email_lowercase) để UNIQUE không phân biệt hoa/thường. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
