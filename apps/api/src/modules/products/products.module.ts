import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncModule } from '../chain-sync/index.js';
import { IdentityModule } from '../identity/index.js';
import { OrganizationsModule } from '../organizations/index.js';
import { DeleteProductDraft } from './application/delete-product-draft.use-case.js';
import { ManufacturerAccess } from './application/manufacturer-access.service.js';
import { ProductAuthorizer } from './application/product-authorizer.service.js';
import { GetMyProduct, GetPublicPassport, ListMyProducts } from './application/product-queries.js';
import { ProductViews } from './application/product-views.js';
import { RecordProductTransaction } from './application/record-product-transaction.use-case.js';
import { RegisterProducts } from './application/register-products.use-case.js';
import { RetryProductRegistration } from './application/retry-product-registration.use-case.js';
import { PRODUCT_PORT_PROVIDERS } from './products.providers.js';
import { MyProductsController } from './presentation/my-products.controller.js';
import { PublicProductsController } from './presentation/public-products.controller.js';

/** M5 Products (tiến trình API): PRD-01, PRD-02 đăng ký sản phẩm, mã QR, tra cứu công khai. */
@Module({
  imports: [
    DatabaseModule,
    BlockchainModule,
    AuditModule,
    ChainSyncModule,
    IdentityModule,
    OrganizationsModule,
  ],
  controllers: [MyProductsController, PublicProductsController],
  providers: [
    ...PRODUCT_PORT_PROVIDERS,
    ManufacturerAccess,
    ProductAuthorizer,
    ProductViews,
    RegisterProducts,
    RetryProductRegistration,
    RecordProductTransaction,
    DeleteProductDraft,
    ListMyProducts,
    GetMyProduct,
    GetPublicPassport,
  ],
})
export class ProductsModule {}
