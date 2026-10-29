import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import type {
  InventoryDetail,
  MyInventory,
  ProductSaleAuthorization,
  TrackedTransactionView,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { Client } from '../../../common/http/client-context.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { type AuthenticatedUser, CurrentUser, SessionGuard } from '../../identity/index.js';
import { GetInventoryItem, ListMyInventory } from '../application/inventory-queries.js';
import { PrepareProductSale } from '../application/prepare-product-sale.use-case.js';
import { RecordInventoryTransaction } from '../application/record-product-transaction.use-case.js';
import {
  type InventoryListQueryInput,
  inventoryListQuerySchema,
  productIdSchema,
  type ProductTransactionBody,
  productTransactionSchema,
  type SaleAuthorizationBody,
  saleAuthorizationSchema,
} from './products.schemas.js';

/** Kho hàng của nhà bán lẻ: DST-02 nhận hoặc từ chối hàng, DST-03 bán và kích hoạt bảo hành. */
@Controller('me/inventory')
@UseGuards(SessionGuard)
export class InventoryController {
  constructor(
    private readonly listInventory: ListMyInventory,
    private readonly getItem: GetInventoryItem,
    private readonly prepareSale: PrepareProductSale,
    private readonly recordTransaction: RecordInventoryTransaction,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(inventoryListQuerySchema)) query: InventoryListQueryInput,
  ): Promise<MyInventory> {
    return this.listInventory.execute(user, query);
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
  ): Promise<InventoryDetail> {
    return this.getItem.execute(user, productId);
  }

  @Post(':id/sale-authorizations')
  @HttpCode(201)
  authorizeSale(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(productIdSchema)) productId: string,
    @Body(new ZodValidationPipe(saleAuthorizationSchema)) body: SaleAuthorizationBody,
    @Client() client: ClientContext,
  ): Promise<ProductSaleAuthorization> {
    return this.prepareSale.execute(user, productId, body.buyerEmail, client);
  }
}
