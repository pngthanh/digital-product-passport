import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  extractPublicCode,
  type OwnedProductLifecycle,
  type PublicLifecycleView,
  RECALL_MAX_BATCH_SIZE,
  RECALL_REASON_MAX_LENGTH,
  RECALL_REASON_MIN_LENGTH,
  type RecallAuthorizationView,
  type TrackedTransactionView,
} from '@dpp/shared';
import { z } from 'zod';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { Client } from '../../../common/http/client-context.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { type AuthenticatedUser, CurrentUser, SessionGuard } from '../../identity/index.js';
import {
  GetOwnedProductLifecycle,
  GetPublicLifecycle,
  RecordLifecycleTransaction,
} from '../application/owner-lifecycle.use-cases.js';
import { PrepareRecall } from '../application/recall.use-cases.js';

const productIdSchema = z.uuid('Mã sản phẩm không hợp lệ');
/** Mã trên tem, có hoặc không gạch nối (giống tra cứu hộ chiếu công khai). */
const publicCodeSchema = z.string().transform((value, context) => {
  const code = extractPublicCode(value);
  if (!code) {
    context.addIssue({ code: 'custom', message: 'Mã tra cứu không hợp lệ' });
    return z.NEVER;
  }
  return code;
});

const recallSchema = z.object({
  productIds: z
    .array(productIdSchema)
    .min(1, 'Chọn ít nhất một sản phẩm')
    .max(RECALL_MAX_BATCH_SIZE, `Mỗi lần thu hồi tối đa ${RECALL_MAX_BATCH_SIZE} sản phẩm`),
  reason: z
    .string('Nhập lý do thu hồi')
    .trim()
    .min(RECALL_REASON_MIN_LENGTH, `Lý do thu hồi tối thiểu ${RECALL_REASON_MIN_LENGTH} ký tự`)
    .max(RECALL_REASON_MAX_LENGTH, `Lý do thu hồi tối đa ${RECALL_REASON_MAX_LENGTH} ký tự`),
});
type RecallBody = z.infer<typeof recallSchema>;

const transactionSchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Mã giao dịch không hợp lệ'),
});
type TransactionBody = z.infer<typeof transactionSchema>;

/** RCL-01: nhà sản xuất chuẩn bị thu hồi (lưu lý do, giấy phép EIP-712). */
@Controller('me/products')
@UseGuards(SessionGuard)
export class RecallController {
  constructor(private readonly prepareRecall: PrepareRecall) {}

  @Post('recall-authorizations')
  @HttpCode(201)
  prepare(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(recallSchema)) body: RecallBody,
    @Client() client: ClientContext,
  ): Promise<RecallAuthorizationView> {
    return this.prepareRecall.execute(user, body, client);
  }
}

/** LIF-01, LIF-02: khung của chủ sở hữu; mọi hàm ProductLifecycle báo txHash ở đây. */
@Controller('me')
@UseGuards(SessionGuard)
export class OwnerLifecycleController {
  constructor(
    private readonly getLifecycle: GetOwnedProductLifecycle,
    private readonly recordTransaction: RecordLifecycleTransaction,
  ) {}

  @Get('owned-products/:id/lifecycle')
  lifecycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(productIdSchema)) id: string,
  ): Promise<OwnedProductLifecycle> {
    return this.getLifecycle.execute(user, id);
  }

  @Post('lifecycle/transactions')
  @HttpCode(202)
  transaction(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(transactionSchema)) body: TransactionBody,
    @Client() client: ClientContext,
  ): Promise<TrackedTransactionView> {
    return this.recordTransaction.execute(user, body.txHash, client);
  }
}

/** VER-01 (phần M10): cảnh báo thu hồi, báo mất, ngừng sử dụng trên hộ chiếu công khai. */
@Controller('public/products')
export class PublicLifecycleController {
  constructor(private readonly getLifecycle: GetPublicLifecycle) {}

  @Get(':code/lifecycle')
  lifecycle(
    @Param('code', new ZodValidationPipe(publicCodeSchema)) code: string,
  ): Promise<PublicLifecycleView> {
    return this.getLifecycle.execute(code);
  }
}
