import { describe, expect, it } from 'vitest';
import { toApiError } from './api-error';

describe('toApiError', () => {
  it('giữ mã lỗi nghiệp vụ và thông báo của API', () => {
    const error = toApiError(409, {
      statusCode: 409,
      message: 'Email này đã được dùng để đăng ký tài khoản khác.',
      code: 'EMAIL_TAKEN',
    });

    expect(error).toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
    expect(error.message).toContain('Email này');
  });

  it('gom lỗi kiểm tra dữ liệu theo từng ô', () => {
    const error = toApiError(400, {
      message: 'Dữ liệu gửi lên không hợp lệ',
      details: [
        { path: 'email', message: 'Email không hợp lệ' },
        { path: 'email', message: 'Lỗi thứ hai bị bỏ qua' },
        { path: 'fullName', message: 'Nhập họ tên' },
      ],
    });

    expect(error.fieldErrors).toEqual({ email: 'Email không hợp lệ', fullName: 'Nhập họ tên' });
  });

  it('thân lỗi lạ được thay bằng thông báo chung', () => {
    expect(toApiError(502, '<html>Bad Gateway</html>').message).toContain('Không kết nối được');
  });
});
