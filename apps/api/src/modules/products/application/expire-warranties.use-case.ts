import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';

/** D10: đồng bộ cột warranty_state cho bảo hành đã quá hạn, để tra cứu và thống kê theo cột. */
@Injectable()
export class ExpireWarranties {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  runOnce(): Promise<number> {
    return this.products.expireWarranties(this.clock.now());
  }
}
