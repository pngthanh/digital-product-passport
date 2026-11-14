import { Module } from '@nestjs/common';
import { BlockchainModule } from '../../infrastructure/blockchain/blockchain.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuditModule } from '../audit/index.js';
import { ChainSyncModule } from '../chain-sync/index.js';
import { IdentityModule } from '../identity/index.js';
import { OrganizationsModule } from '../organizations/index.js';
import { ProductsModule } from '../products/index.js';
import { ServiceModule } from '../service/index.js';
import {
  GetOwnedProductTransfer,
  PrepareTransferRequest,
  PreviewTransferRecipient,
  TransferOwnerAccess,
} from './application/owner-transfer.use-cases.js';
import { RecipientResolver } from './application/recipient-resolver.js';
import { TransferParties } from './application/transfer-parties.js';
import { ListMyTransfers, RecordTransferTransaction } from './application/transfer-queries.js';
import { TransferViews } from './application/transfer-views.js';
import { OwnerTransferController } from './presentation/owner-transfer.controller.js';
import { TransfersController } from './presentation/transfers.controller.js';
import { TRANSFER_PORT_PROVIDERS } from './transfer.providers.js';
import { TRANSFER_STATISTICS } from './application/ports/transfer-statistics.reader.js';

/**
 * Transfer (tiến trình API). M9: TRF-01 chủ sở hữu tạo yêu cầu chuyển nhượng (giấy phép registrar),
 * TRF-02..05 huỷ, chấp nhận, từ chối, đóng yêu cầu quá hạn bằng ví của từng bên, TRF-06 danh sách.
 */
@Module({
  imports: [
    DatabaseModule,
    BlockchainModule,
    AuditModule,
    ChainSyncModule,
    IdentityModule,
    OrganizationsModule,
    ProductsModule,
    ServiceModule,
  ],
  controllers: [OwnerTransferController, TransfersController],
  exports: [TRANSFER_STATISTICS],
  providers: [
    ...TRANSFER_PORT_PROVIDERS,
    TransferOwnerAccess,
    TransferParties,
    RecipientResolver,
    TransferViews,
    GetOwnedProductTransfer,
    PreviewTransferRecipient,
    PrepareTransferRequest,
    ListMyTransfers,
    RecordTransferTransaction,
  ],
})
export class TransferModule {}
