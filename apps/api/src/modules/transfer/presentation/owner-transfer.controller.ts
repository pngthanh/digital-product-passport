import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type {
  OwnedProductTransfer,
  TransferRecipientPreview,
  TransferRequestAuthorization,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { Client } from '../../../common/http/client-context.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { type AuthenticatedUser, CurrentUser, SessionGuard } from '../../identity/index.js';
import {
  GetOwnedProductTransfer,
  PrepareTransferRequest,
  PreviewTransferRecipient,
} from '../application/owner-transfer.use-cases.js';
import {
  type TransferAuthorizationBody,
  transferAuthorizationSchema,
  transferIdSchema,
  type TransferRecipientBody,
  transferRecipientSchema,
} from './transfer.schemas.js';

/** Phía chủ sở hữu trên trang sản phẩm đã mua: xem yêu cầu, tra bên nhận, TRF-01 tạo yêu cầu. */
@Controller('me/owned-products')
@UseGuards(SessionGuard)
export class OwnerTransferController {
  constructor(
    private readonly getTransfer: GetOwnedProductTransfer,
    private readonly preview: PreviewTransferRecipient,
    private readonly prepare: PrepareTransferRequest,
  ) {}

  @Get(':id/transfer')
  transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(transferIdSchema)) productId: string,
  ): Promise<OwnedProductTransfer> {
    return this.getTransfer.execute(user, productId);
  }

  @Post(':id/transfer-recipients')
  @HttpCode(200)
  recipient(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(transferIdSchema)) productId: string,
    @Body(new ZodValidationPipe(transferRecipientSchema)) body: TransferRecipientBody,
  ): Promise<TransferRecipientPreview> {
    return this.preview.execute(user, productId, body.recipient);
  }

  @Post(':id/transfer-authorizations')
  @HttpCode(201)
  authorize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(transferIdSchema)) productId: string,
    @Body(new ZodValidationPipe(transferAuthorizationSchema)) body: TransferAuthorizationBody,
    @Client() client: ClientContext,
  ): Promise<TransferRequestAuthorization> {
    return this.prepare.execute(user, productId, body, client);
  }
}
