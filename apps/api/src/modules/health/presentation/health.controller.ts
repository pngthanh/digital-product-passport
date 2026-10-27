import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from '../application/health.service.js';
import type { HealthReport, LivenessReport } from '../domain/health-report.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: tiến trình còn chạy. */
  @Get()
  liveness(): LivenessReport {
    return this.health.liveness();
  }

  /** Readiness: CSDL và RPC blockchain; trả 503 khi chưa sẵn sàng phục vụ. */
  @Get('ready')
  async readiness(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const report = await this.health.readiness();
    res.status(report.status === 'down' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK);
    return report;
  }
}
