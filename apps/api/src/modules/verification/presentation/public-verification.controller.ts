import { Controller, Get, Param } from '@nestjs/common';
import { extractPublicCode, type PublicVerificationView } from '@dpp/shared';
import { z } from 'zod';
import { PublicRateLimit } from '../../../common/http/rate-limit.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { VerifyPublicProduct } from '../application/verify-public-product.query.js';

const publicCodeSchema = z.string().transform((value, context) => {
  const code = extractPublicCode(value);
  if (!code) {
    context.addIssue({ code: 'custom', message: 'Mã tra cứu không hợp lệ' });
    return z.NEVER;
  }
  return code;
});

/** VER-01 (M11): đối chiếu hộ chiếu công khai với contract, không cần đăng nhập. */
@PublicRateLimit()
@Controller('public/products')
export class PublicVerificationController {
  constructor(private readonly verify: VerifyPublicProduct) {}

  @Get(':code/verification')
  verification(
    @Param('code', new ZodValidationPipe(publicCodeSchema)) code: string,
  ): Promise<PublicVerificationView> {
    return this.verify.execute(code);
  }
}
