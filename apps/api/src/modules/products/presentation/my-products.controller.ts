import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  MyProductList,
  ProductDetail,
  ProductRegistrationAuthorization,
  TrackedTransactionView,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { Client } from '../../../common/http/client-context.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { type AuthenticatedUser, CurrentUser, SessionGuard } from '../../identity/index.js';
import { DeleteProductDraft } from '../application/delete-product-draft.use-case.js';
import { GetMyProduct, ListMyProducts } from '../application/product-queries.js';
import { RecordProductTransaction } from '../application/record-product-transaction.use-case.js';
import { RegisterProducts } from '../application/register-products.use-case.js';
import { RetryProductRegistration } from '../application/retry-product-registration.use-case.js';
import {
  productIdSchema,
  type ProductListQueryInput,
  productListQuerySchema,
  type ProductRegistrationBody,
  productRegistrationSchema,
  type ProductRetryBody,
  productRetrySchema,
  type ProductTransactionBody,
  productTransactionSchema,
} from './products.schemas.js';

/** PRD-01 (từng sản phẩm), PRD-02 (lô CSV) và quản lý sản phẩm của nhà sản xuất. */
@Controller('me/products')
@UseGuards(SessionGuard)
export class MyProductsController {
  constructor(
    private readonly listProducts: ListMyProducts,
    private readonly getProduct: GetMyProduct,
    private readonly registerProducts: RegisterProducts,
    private readonly retryRegistration: RetryProductRegistration,
    private readonly recordTransaction: RecordProductTransaction,
    private readonly deleteDraft: DeleteProductDraft,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(productListQuerySchema)) query: ProductListQueryInput,
  ): Promise<MyProductList> {
    return this.listProducts.execute(user, {
      filter: query.filter,
      search: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Post('registrations')
  @HttpCode(201)
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(productRegistrationSchema)) body: ProductRegistrationBody,
    @Client() client: ClientContext,
  ): Promise<ProductRegistrationAuthorization> {
    return this.registerProducts.execute(user, body.items, client);
  }

  @Post('registrations/retry')
  @HttpCode(201)
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(productRetrySchema)) body: ProductRetryBody,
    @Client() client: ClientContext,
  ): Promise<ProductRegistrationAuthorization> {
    return this.retryRegistration.execute(user, body.productIds, client);
  }

  @Post('transactions')
  @HttpCode(202)
  transaction(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(productTransactionSchema)) body: ProductTransactionBody,
    @Client() client: ClientContext,
  ): Promise<TrackedTransactionView> {
    return this.recordTransaction.execute(user, body.txHash, client);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(productIdSchema)) productId: string,
  ): Promise<ProductDetail> {
    return this.getProduct.execute(user, productId);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(productIdSchema)) productId: string,
    @Client() client: ClientContext,
  ): Promise<void> {
    await this.deleteDraft.execute(user, productId, client);
  }
}
