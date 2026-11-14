import { Controller, Get, Header, Param, type StreamableFile } from '@nestjs/common';
import type { PublicProductInspections } from '@dpp/shared';
import { PublicRateLimit } from '../../../common/http/rate-limit.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { GetInspectionReport } from '../application/inspection-commands.js';
import { GetPublicInspections } from '../application/inspection-queries.js';
import { inspectionIdSchema, publicCodeSchema } from './inspection.schemas.js';
import { reportFile } from './report-file.js';

/** Kết quả kiểm định trên hộ chiếu công khai và file biên bản đã ghi on-chain: không cần đăng nhập. */
@PublicRateLimit()
@Controller('public')
export class PublicInspectionsController {
  constructor(
    private readonly inspections: GetPublicInspections,
    private readonly report: GetInspectionReport,
  ) {}

  @Get('products/:code/inspections')
  list(
    @Param('code', new ZodValidationPipe(publicCodeSchema)) publicCode: string,
  ): Promise<PublicProductInspections> {
    return this.inspections.execute(publicCode);
  }

  @Get('inspections/:id/report')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=300')
  async download(
    @Param('id', new ZodValidationPipe(inspectionIdSchema)) requestId: string,
  ): Promise<StreamableFile> {
    return reportFile(await this.report.execute(requestId));
  }
}
