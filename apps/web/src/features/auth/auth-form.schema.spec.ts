import { describe, expect, it } from 'vitest';
import { fieldErrorsOf, loginFormSchema, registerFormSchema } from './auth-form.schema';

const valid = {
  fullName: 'Nguyễn An',
  email: ' an@example.com ',
  password: 'mat khau dai',
  confirmPassword: 'mat khau dai',
};

describe('Form đăng ký, đăng nhập', () => {
  it('chuẩn hoá email và chấp nhận dữ liệu hợp lệ', () => {
    const parsed = registerFormSchema.parse(valid);
    expect(parsed.email).toBe('an@example.com');
  });

  it('báo lỗi theo từng ô cùng lúc, mỗi ô một thông báo', () => {
    const result = registerFormSchema.safeParse({
      fullName: ' ',
      email: 'khong-hop-le',
      password: 'ngan',
      confirmPassword: 'khac',
    });

    expect(result.success).toBe(false);
    expect(result.success ? {} : fieldErrorsOf(result.error)).toEqual({
      fullName: 'Nhập họ tên',
      email: 'Email không hợp lệ',
      password: 'Mật khẩu cần ít nhất 8 ký tự',
      confirmPassword: 'Mật khẩu nhập lại không khớp',
    });
  });

  it('bắt lỗi nhập lại mật khẩu không khớp', () => {
    const result = registerFormSchema.safeParse({ ...valid, confirmPassword: 'mat khau khac' });

    expect(result.success ? {} : fieldErrorsOf(result.error)).toEqual({
      confirmPassword: 'Mật khẩu nhập lại không khớp',
    });
  });

  it('đăng nhập chỉ cần có mật khẩu, độ dài do API kiểm tra', () => {
    expect(loginFormSchema.safeParse({ email: 'an@example.com', password: 'x' }).success).toBe(
      true,
    );
  });
});
