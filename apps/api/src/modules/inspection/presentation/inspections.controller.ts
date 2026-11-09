import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  type StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {
  InspectionDetail,
  InspectionRecordAuthorization,
  MyInspections,
  TrackedTransactionView,
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
  DeclineInspectionRequest,
  GetInspectionReport,
  PrepareInspectionRecord,
  RecordInspectionTransaction,
} from '../application/inspection-commands.js';
import { GetInspection, ListInspections } from '../application/inspection-queries.js';
import {
  type InspectionDeclineBody,
  inspectionDeclineSchema,
  inspectionIdSchema,
  type InspectionListQuery,
  inspectionListQuerySchema,
  type InspectionResultBody,
  inspectionResultSchema,
  type InspectionTransactionBody,
  inspectionTransactionSchema,
} from './inspection.schemas.js';
import { reportFile } from './report-file.js';

/**
 * Yêu cầu gửi tới đơn vị kiểm định: xem, INS-01 ghi kết quả (ví cá nhân của người đại diện ký giao
 * dịch), INS-04 từ chối kèm lý do.
 */
@Controller('me/inspections')
@UseGuards(SessionGuard)
export class InspectionsController {
  constructor(
    private readonly listInspections: ListInspections,
    private readonly getInspection: GetInspection,
    private readonly prepareRecord: PrepareInspectionRecord,
    private readonly declineRequest: DeclineInspectionRequest,
    private readonly recordTransaction: RecordInspectionTransaction,
    private readonly report: GetInspectionReport,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(inspectionListQuerySchema)) query: InspectionListQuery,
  ): Promise<MyInspections> {
    return this.listInspections.execute(user, query);
  }

  @Post('transactions')
  @HttpCode(202)
  transaction(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(inspectionTransactionSchema)) body: InspectionTransactionBody,
    @Client() client: ClientContext,
  ): Promise<TrackedTransactionView> {
    return this.recordTransaction.execute(user, body.txHash, client);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(inspectionIdSchema)) requestId: string,
  ): Promise<InspectionDetail> {
    return this.getInspection.execute(user, requestId);
  }

  /** multipart/form-data: result, summary và file `report` (không bắt buộc). */
  @Post(':id/results')
  @HttpCode(201)
  @UseFilters(EvidenceTooLargeFilter)
  @UseInterceptors(FileInterceptor('report', { limits: EVIDENCE_UPLOAD_LIMITS }))
  result(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(inspectionIdSchema)) requestId: string,
    @Body(new ZodValidationPipe(inspectionResultSchema)) body: InspectionResultBody,
    @UploadedFile() file: UploadedEvidence | undefined,
    @Client() client: ClientContext,
  ): Promise<InspectionRecordAuthorization> {
    return this.prepareRecord.execute(user, requestId, body, file, client);
  }

  @Post(':id/decline')
  @HttpCode(204)
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(inspectionIdSchema)) requestId: string,
    @Body(new ZodValidationPipe(inspectionDeclineSchema)) body: InspectionDeclineBody,
    @Client() client: ClientContext,
  ): Promise<void> {
    return this.declineRequest.execute(user, requestId, body.reason, client);
  }

  /** Đơn vị kiểm định xem cả file của biên bản đang chờ ghi on-chain. */
  @Get(':id/report')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(inspectionIdSchema)) requestId: string,
  ): Promise<StreamableFile> {
    return reportFile(await this.report.execute(requestId, user));
  }
}
