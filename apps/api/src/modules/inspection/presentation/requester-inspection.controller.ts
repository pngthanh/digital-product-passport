import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { InspectionRequestView, ProductInspection } from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { Client } from '../../../common/http/client-context.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { type AuthenticatedUser, CurrentUser, SessionGuard } from '../../identity/index.js';
import {
  CancelInspectionRequest,
  GetProductInspection,
  SubmitInspectionRequest,
} from '../application/requester.use-cases.js';
import {
  type InspectionRequestBody,
  inspectionIdSchema,
  inspectionRequestSchema,
} from './inspection.schemas.js';

/**
 * Bên gửi yêu cầu kiểm định: nhà sản xuất trên trang sản phẩm đã phát hành, chủ sở hữu trên trang
 * sản phẩm đã mua. INS-02 gửi, INS-03 huỷ khi chưa có kết quả.
 */
@Controller('me')
@UseGuards(SessionGuard)
export class RequesterInspectionController {
  constructor(
    private readonly getInspection: GetProductInspection,
    private readonly submit: SubmitInspectionRequest,
    private readonly cancelRequest: CancelInspectionRequest,
  ) {}

  @Get('products/:id/inspection')
  manufacturerView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(inspectionIdSchema)) productId: string,
  ): Promise<ProductInspection> {
    return this.getInspection.execute(user, productId, 'MANUFACTURER');
  }

  @Post('products/:id/inspection-requests')
  @HttpCode(201)
  manufacturerRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(inspectionIdSchema)) productId: string,
    @Body(new ZodValidationPipe(inspectionRequestSchema)) body: InspectionRequestBody,
    @Client() client: ClientContext,
  ): Promise<InspectionRequestView> {
    return this.submit.execute(user, productId, 'MANUFACTURER', body, client);
  }

  @Get('owned-products/:id/inspection')
  ownerView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(inspectionIdSchema)) productId: string,
  ): Promise<ProductInspection> {
    return this.getInspection.execute(user, productId, 'OWNER');
  }

  @Post('owned-products/:id/inspection-requests')
  @HttpCode(201)
  ownerRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(inspectionIdSchema)) productId: string,
    @Body(new ZodValidationPipe(inspectionRequestSchema)) body: InspectionRequestBody,
    @Client() client: ClientContext,
  ): Promise<InspectionRequestView> {
    return this.submit.execute(user, productId, 'OWNER', body, client);
  }

  @Post('inspection-requests/:id/cancel')
  @HttpCode(204)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(inspectionIdSchema)) requestId: string,
    @Client() client: ClientContext,
  ): Promise<void> {
    return this.cancelRequest.execute(user, requestId, client);
  }
}
