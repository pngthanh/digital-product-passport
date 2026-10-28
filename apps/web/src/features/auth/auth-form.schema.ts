import {
  EMAIL_MAX_LENGTH,
  FULL_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@dpp/shared';
import { z } from 'zod';

/*
 * Kiểm tra sớm trên trình duyệt để báo lỗi ngay tại ô nhập; API vẫn kiểm tra lại toàn bộ.
 * Giới hạn độ dài lấy từ @dpp/shared nên luôn khớp với backend.
 */

const email = z
  .string()
  .trim()
  .min(1, 'Nhập email')
  .max(EMAIL_MAX_LENGTH, `Email tối đa ${EMAIL_MAX_LENGTH} ký tự`)
  .pipe(z.email('Email không hợp lệ'));

export const loginFormSchema = z.object({
  email,
  password: z.string().min(1, 'Nhập mật khẩu'),
});

export const registerFormSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, 'Nhập họ tên')
      .max(FULL_NAME_MAX_LENGTH, `Họ tên tối đa ${FULL_NAME_MAX_LENGTH} ký tự`),
    email,
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Mật khẩu cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự`)
      .max(PASSWORD_MAX_LENGTH, `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự`),
    confirmPassword: z.string(),
  })
  .refine((form) => form.password === form.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu nhập lại không khớp',
  });

export type FieldErrors = Partial<Record<string, string>>;

/** Lỗi đầu tiên của từng ô, theo tên trường. */
export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return errors;
}

/** Đọc giá trị chuỗi từ FormData, bỏ qua File. */
export function formValues(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form)) {
    if (typeof value === 'string') {
      values[key] = value;
    }
  }
  return values;
}
