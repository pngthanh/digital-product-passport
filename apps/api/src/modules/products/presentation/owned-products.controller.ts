import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { MyWorkspace, OwnedProduct, OwnedProductDetail, RetailerOption } from '@dpp/shared';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { type AuthenticatedUser, CurrentUser, SessionGuard } from '../../identity/index.js';
import {
  GetOwnedProduct,
  GetWorkspace,
  ListOwnedProducts,
} from '../application/owned-product-queries.js';
import { ListRetailers } from '../application/product-queries.js';
import { productIdSchema } from './products.schemas.js';

/** Sản phẩm người dùng đang sở hữu (sau DST-03) và menu theo vai trò. */
@Controller('me')
@UseGuards(SessionGuard)
export class OwnedProductsController {
  constructor(
    private readonly listOwned: ListOwnedProducts,
    private readonly getOwned: GetOwnedProduct,
    private readonly workspace: GetWorkspace,
    private readonly retailers: ListRetailers,
  ) {}

  @Get('workspace')
  myWorkspace(@CurrentUser() user: AuthenticatedUser): Promise<MyWorkspace> {
    return this.workspace.execute(user);
  }

  /** DST-01: nhà bán lẻ đã duyệt, cho nhà sản xuất chọn khi gửi hàng. */
  @Get('retailers')
  listRetailers(@CurrentUser() user: AuthenticatedUser): Promise<RetailerOption[]> {
    return this.retailers.execute(user);
  }

  @Get('owned-products')
  list(@CurrentUser() user: AuthenticatedUser): Promise<OwnedProduct[]> {
    return this.listOwned.execute(user);
  }

  @Get('owned-products/:id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(productIdSchema)) productId: string,
  ): Promise<OwnedProductDetail> {
    return this.getOwned.execute(user, productId);
  }
}
