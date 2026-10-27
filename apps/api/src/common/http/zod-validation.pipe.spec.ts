import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ serial: z.string().min(3) }));

  it('trả về dữ liệu đã kiểm tra', () => {
    expect(pipe.transform({ serial: 'ABC-2026-000128' })).toEqual({ serial: 'ABC-2026-000128' });
  });

  it('ném BadRequestException kèm đường dẫn trường lỗi', () => {
    let caught: unknown;
    try {
      pipe.transform({ serial: 'A' });
    } catch (error) {
      caught = error;
    }

    if (!(caught instanceof BadRequestException)) {
      throw new Error('Mong đợi BadRequestException');
    }
    expect(caught.getResponse()).toMatchObject({
      details: [expect.objectContaining({ path: 'serial' })],
    });
  });
});
