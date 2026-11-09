import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type MyServiceTickets,
  type ServiceTicketClosing,
  type ServiceTicketDetail,
  type ServiceTicketOpeningAuthorization,
  type TrackedTransactionView,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import type { UploadedEvidence } from '../../../common/files/evidence-file.js';
import { Client } from '../../../common/http/client-context.js';
import {
  EVIDENCE_UPLOAD_LIMITS,
  EvidenceTooLargeFilter,
} from '../../../common/http/evidence-upload.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { type AuthenticatedUser, CurrentUser, SessionGuard } from '../../identity/index.js';
import {
  PrepareTicketClosing,
  PrepareTicketOpening,
  RecordServiceTransaction,
} from '../application/service-ticket-commands.js';
import { GetServiceTicket, ListServiceTickets } from '../application/service-ticket-queries.js';
import {
  type ServiceResultBody,
  serviceIdSchema,
  serviceResultSchema,
  type ServiceTicketListQueryInput,
  serviceTicketListQuerySchema,
  type ServiceTransactionBody,
  serviceTransactionSchema,
} from './service.schemas.js';

/**
 * Phiếu của trung tâm bảo hành: xem yêu cầu, SVC-03 tiếp nhận và mở phiếu, SVC-04 ghi kết quả
 * và đóng phiếu. Ví cá nhân của người đại diện ký giao dịch.
 */
@Controller('me/service-tickets')
@UseGuards(SessionGuard)
export class ServiceTicketsController {
  constructor(
    private readonly listTickets: ListServiceTickets,
    private readonly getTicket: GetServiceTicket,
    private readonly prepareOpening: PrepareTicketOpening,
    private readonly prepareClosing: PrepareTicketClosing,
    private readonly recordTransaction: RecordServiceTransaction,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(serviceTicketListQuerySchema)) query: ServiceTicketListQueryInput,
  ): Promise<MyServiceTickets> {
    return this.listTickets.execute(user, query);
  }

  @Post('transactions')
  @HttpCode(202)
  transaction(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(serviceTransactionSchema)) body: ServiceTransactionBody,
    @Client() client: ClientContext,
  ): Promise<TrackedTransactionView> {
    return this.recordTransaction.execute(user, body.txHash, client);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(serviceIdSchema)) requestId: string,
  ): Promise<ServiceTicketDetail> {
    return this.getTicket.execute(user, requestId);
  }

  @Post(':id/opening-authorizations')
  @HttpCode(201)
  authorizeOpening(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(serviceIdSchema)) requestId: string,
    @Client() client: ClientContext,
  ): Promise<ServiceTicketOpeningAuthorization> {
    return this.prepareOpening.execute(user, requestId, client);
  }

  /** multipart/form-data: repaired, actionCode, actionDetail và file `evidence` (không bắt buộc). */
  @Post(':id/results')
  @HttpCode(201)
  @UseFilters(EvidenceTooLargeFilter)
  @UseInterceptors(FileInterceptor('evidence', { limits: EVIDENCE_UPLOAD_LIMITS }))
  result(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(serviceIdSchema)) requestId: string,
    @Body(new ZodValidationPipe(serviceResultSchema)) body: ServiceResultBody,
    @UploadedFile() file: UploadedEvidence | undefined,
    @Client() client: ClientContext,
  ): Promise<ServiceTicketClosing> {
    return this.prepareClosing.execute(user, requestId, body, file, client);
  }
}
