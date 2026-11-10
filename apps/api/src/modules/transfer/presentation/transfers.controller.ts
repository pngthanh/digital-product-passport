import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import type { MyTransfers, TrackedTransactionView } from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { Client } from '../../../common/http/client-context.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { type AuthenticatedUser, CurrentUser, SessionGuard } from '../../identity/index.js';
import { ListMyTransfers, RecordTransferTransaction } from '../application/transfer-queries.js';
import {
  type TransferListQuery,
  transferListQuerySchema,
  type TransferTransactionBody,
  transferTransactionSchema,
} from './transfer.schemas.js';

/**
 * TRF-06 danh sách yêu cầu của người dùng. Chấp nhận, từ chối, huỷ, đóng yêu cầu quá hạn
 * (TRF-02..05) không cần giấy phép: ví gửi thẳng tới OwnershipTransfer rồi báo txHash ở đây.
 */
@Controller('me/transfers')
@UseGuards(SessionGuard)
export class TransfersController {
  constructor(
    private readonly listTransfers: ListMyTransfers,
    private readonly recordTransaction: RecordTransferTransaction,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(transferListQuerySchema)) query: TransferListQuery,
  ): Promise<MyTransfers> {
    return this.listTransfers.execute(user, query);
  }

  @Post('transactions')
  @HttpCode(202)
  transaction(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(transferTransactionSchema)) body: TransferTransactionBody,
    @Client() client: ClientContext,
  ): Promise<TrackedTransactionView> {
    return this.recordTransaction.execute(user, body.txHash, client);
  }
}
