import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DomainError } from '../domain/domain-error.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

class SampleConflictError extends DomainError {
  readonly code = 'SAMPLE_CONFLICT';
  readonly kind = 'conflict';
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('giữ nguyên mã lỗi và thông điệp của HttpException', () => {
    const body = filter.toBody(
      new NotFoundException('Không tìm thấy sản phẩm'),
      '/api/v1/x',
      'req-1',
    );

    expect(body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      message: 'Không tìm thấy sản phẩm',
      path: '/api/v1/x',
      requestId: 'req-1',
    });
  });

  it('chuyển tiếp chi tiết lỗi kiểm tra dữ liệu', () => {
    const details = [{ path: 'serial', message: 'Required' }];
    const body = filter.toBody(
      new BadRequestException({ message: 'Dữ liệu gửi lên không hợp lệ', details }),
      '/api/v1/x',
      null,
    );

    expect(body.statusCode).toBe(400);
    expect(body.details).toEqual(details);
  });

  it('không lộ thông tin nội bộ với lỗi ngoài dự kiến', () => {
    const body = filter.toBody(new Error('password=secret'), '/api/v1/x', 'req-2');

    expect(body.statusCode).toBe(500);
    expect(body.message).not.toContain('secret');
  });

  it('ánh xạ lỗi nghiệp vụ sang mã HTTP và giữ mã lỗi ổn định', () => {
    const body = filter.toBody(
      new SampleConflictError('Ví đã thuộc tài khoản khác', { address: '0xabc' }),
      '/api/v1/x',
      null,
    );

    expect(body).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
      code: 'SAMPLE_CONFLICT',
      message: 'Ví đã thuộc tài khoản khác',
      details: { address: '0xabc' },
    });
  });
});
