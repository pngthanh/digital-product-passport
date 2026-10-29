import type { z } from 'zod';

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
