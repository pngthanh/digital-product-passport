import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncModule } from '../chain-sync/index.js';
import { IdentityModule } from '../identity/index.js';
import { OrganizationsModule } from '../organizations/index.js';
import { DeleteProductDraft } from './application/delete-product-draft.use-case.js';
import { GetInventoryItem, ListMyInventory } from './application/inventory-queries.js';
import { ManufacturerAccess, RetailerAccess } from './application/organization-access.service.js';
import {
  GetOwnedProduct,
  GetWorkspace,
  ListOwnedProducts,
} from './application/owned-product-queries.js';
import { PartyLabels } from './application/party-labels.js';
import { PrepareProductSale } from './application/prepare-product-sale.use-case.js';
import { ProductDirectory } from './application/product-directory.service.js';
import { ProductAuthorizer } from './application/product-authorizer.service.js';
import {
  GetMyProduct,
  GetPublicPassport,
  ListMyProducts,
  ListRetailers,
} from './application/product-queries.js';
import { ProductViews } from './application/product-views.js';
import { PublicHistory } from './application/public-history.js';
import {
  RecordInventoryTransaction,
  RecordProductTransaction,
} from './application/record-product-transaction.use-case.js';
import { RegisterProducts } from './application/register-products.use-case.js';
import { RetryProductRegistration } from './application/retry-product-registration.use-case.js';
import { OwnerParties } from './application/owner-parties.service.js';
import { PRODUCT_PORT_PROVIDERS } from './products.providers.js';
import { InventoryController } from './presentation/inventory.controller.js';
import { MyProductsController } from './presentation/my-products.controller.js';
import { OwnedProductsController } from './presentation/owned-products.controller.js';
import { PublicProductsController } from './presentation/public-products.controller.js';

/**
 * Products (tiến trình API). M5: PRD-01..03 đăng ký sản phẩm, mã QR, tra cứu công khai.
 * M6: DST-01..03 gửi hàng, nhận hàng, bán và kích hoạt bảo hành; sản phẩm của người mua.
 * M7: ProductDirectory cho module service đọc sản phẩm và bảo hành.
 */
@Module({
  imports: [
    DatabaseModule,
    BlockchainModule,
    AuditModule,
    ChainSyncModule,
    IdentityModule,
    OrganizationsModule,
  ],
  controllers: [
    MyProductsController,
    InventoryController,
    OwnedProductsController,
    PublicProductsController,
  ],
  providers: [
    ...PRODUCT_PORT_PROVIDERS,
    ManufacturerAccess,
    OwnerParties,
    RetailerAccess,
    PartyLabels,
    ProductAuthorizer,
    ProductViews,
    PublicHistory,
    RegisterProducts,
    RetryProductRegistration,
    RecordProductTransaction,
    RecordInventoryTransaction,
    DeleteProductDraft,
    PrepareProductSale,
    ListMyProducts,
    GetMyProduct,
    ListRetailers,
    GetPublicPassport,
    ListMyInventory,
    GetInventoryItem,
    ListOwnedProducts,
    GetOwnedProduct,
    GetWorkspace,
    ProductDirectory,
  ],
  exports: [ProductDirectory, OwnerParties],
})
export class ProductsModule {}
