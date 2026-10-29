import { Controller, Get, Param } from '@nestjs/common';
import type { PublicPassportView } from '@dpp/shared';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { GetPublicPassport } from '../application/product-queries.js';
import { publicCodeSchema } from './products.schemas.js';

/** Tra cứu hộ chiếu sản phẩm bằng mã QR: công khai, không cần đăng nhập. */
@Controller('public/products')
export class PublicProductsController {
  constructor(private readonly passport: GetPublicPassport) {}

  @Get(':code')
  get(
    @Param('code', new ZodValidationPipe(publicCodeSchema)) publicCode: string,
  ): Promise<PublicPassportView> {
    return this.passport.execute(publicCode);
  }
}
