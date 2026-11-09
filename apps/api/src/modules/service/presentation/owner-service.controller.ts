import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { OwnedProductService, ServiceRequestView } from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { Client } from '../../../common/http/client-context.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { type AuthenticatedUser, CurrentUser, SessionGuard } from '../../identity/index.js';
import {
  CancelServiceRequest,
  GetOwnedProductService,
  SubmitServiceRequest,
} from '../application/owner-service.use-cases.js';
import { GetServiceEvidence } from '../application/service-ticket-commands.js';
import {
  type ServiceRequestBody,
  serviceIdSchema,
  serviceRequestSchema,
} from './service.schemas.js';

/** Chủ sở hữu: SVC-01 gửi, SVC-02 huỷ yêu cầu bảo hành; xem lịch sử sửa chữa và tải biên bản. */
@Controller('me')
@UseGuards(SessionGuard)
export class OwnerServiceController {
  constructor(
    private readonly getService: GetOwnedProductService,
    private readonly submit: SubmitServiceRequest,
    private readonly cancelRequest: CancelServiceRequest,
    private readonly evidence: GetServiceEvidence,
  ) {}

  @Get('owned-products/:id/service')
  service(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(serviceIdSchema)) productId: string,
  ): Promise<OwnedProductService> {
    return this.getService.execute(user, productId);
  }

  @Post('owned-products/:id/service-requests')
  @HttpCode(201)
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(serviceIdSchema)) productId: string,
    @Body(new ZodValidationPipe(serviceRequestSchema)) body: ServiceRequestBody,
    @Client() client: ClientContext,
  ): Promise<ServiceRequestView> {
    return this.submit.execute(user, productId, body, client);
  }

  @Post('service-requests/:id/cancel')
  @HttpCode(204)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(serviceIdSchema)) requestId: string,
    @Client() client: ClientContext,
  ): Promise<void> {
    return this.cancelRequest.execute(user, requestId, client);
  }

  /** Trung tâm của phiếu hoặc chủ sở hữu đã gửi yêu cầu mới tải được file. */
  @Get('service-requests/:id/evidence')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(serviceIdSchema)) requestId: string,
  ): Promise<StreamableFile> {
    const file = await this.evidence.execute(user, requestId);
    return new StreamableFile(file.content, {
      type: file.mimeType,
      disposition: `inline; filename="${file.fileName}"`,
      length: file.content.length,
    });
  }
}
