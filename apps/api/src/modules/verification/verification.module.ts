import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncModule } from '../chain-sync/index.js';
import { OrganizationsModule } from '../organizations/index.js';
import { ProductsModule } from '../products/index.js';
import { VerifyPublicProduct } from './application/verify-public-product.query.js';
import { PublicVerificationController } from './presentation/public-verification.controller.js';
import { VERIFICATION_PORT_PROVIDERS } from './verification.providers.js';

/**
 * Verification (tiến trình API). M11: VER-01 đối chiếu hộ chiếu công khai với contract tại block
 * Indexer đã chốt; lệch thì cảnh báo Admin. VER-02 (dòng thời gian kèm txHash) nằm ở products.
 */
@Module({
  imports: [BlockchainModule, AuditModule, ChainSyncModule, OrganizationsModule, ProductsModule],
  controllers: [PublicVerificationController],
  providers: [...VERIFICATION_PORT_PROVIDERS, VerifyPublicProduct],
})
export class VerificationModule {}
