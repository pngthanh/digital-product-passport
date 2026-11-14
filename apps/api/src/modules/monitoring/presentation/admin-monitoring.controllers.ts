import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import type {
  AlertSummary,
  AnomalyAlertPage,
  AnomalyAlertView,
  AuditLogPage,
  DashboardStatistics,
} from '@dpp/shared';
import type { z } from 'zod';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { Client } from '../../../common/http/client-context.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { ReviewAnomalyAlert } from '../../audit/index.js';
import {
  AdminGuard,
  type AuthenticatedUser,
  CurrentUser,
  SessionGuard,
} from '../../identity/index.js';
import { GetDashboardStatistics } from '../application/dashboard.query.js';
import {
  GetAlertSummary,
  GetAnomalyAlert,
  ListAnomalyAlerts,
  ListAuditLogs,
} from '../application/monitoring-queries.js';
import {
  alertIdSchema,
  alertListQuerySchema,
  auditLogQuerySchema,
  reviewAlertSchema,
} from './monitoring.schemas.js';

/** AUD-01, AUD-02, AUD-04 (M12): dashboard, nhật ký kiểm toán và xử lý cảnh báo. Chỉ Admin. */
@Controller('admin')
@UseGuards(SessionGuard, AdminGuard)
export class AdminMonitoringController {
  constructor(
    private readonly dashboard: GetDashboardStatistics,
    private readonly auditLogs: ListAuditLogs,
    private readonly alerts: ListAnomalyAlerts,
    private readonly alert: GetAnomalyAlert,
    private readonly summary: GetAlertSummary,
    private readonly review: ReviewAnomalyAlert,
  ) {}

  @Get('dashboard')
  getDashboard(): Promise<DashboardStatistics> {
    return this.dashboard.execute();
  }

  @Get('audit-logs')
  listAuditLogs(
    @Query(new ZodValidationPipe(auditLogQuerySchema))
    query: z.output<typeof auditLogQuerySchema>,
  ): Promise<AuditLogPage> {
    return this.auditLogs.execute(query);
  }

  @Get('alerts')
  listAlerts(
    @Query(new ZodValidationPipe(alertListQuerySchema))
    query: z.output<typeof alertListQuerySchema>,
  ): Promise<AnomalyAlertPage> {
    return this.alerts.execute(query);
  }

  @Get('alerts/summary')
  getAlertSummary(): Promise<AlertSummary> {
    return this.summary.execute();
  }

  @Get('alerts/:id')
  getAlert(
    @Param('id', new ZodValidationPipe(alertIdSchema)) id: string,
  ): Promise<AnomalyAlertView> {
    return this.alert.execute(id);
  }

  @Post('alerts/:id/review')
  @HttpCode(200)
  async reviewAlert(
    @Param('id', new ZodValidationPipe(alertIdSchema)) id: string,
    @Body(new ZodValidationPipe(reviewAlertSchema)) body: z.output<typeof reviewAlertSchema>,
    @CurrentUser() admin: AuthenticatedUser,
    @Client() client: ClientContext,
  ): Promise<AnomalyAlertView> {
    await this.review.execute({
      alertId: id,
      decision: body.decision,
      note: body.note,
      reviewerUserId: admin.id,
      client,
    });
    return this.alert.execute(id);
  }
}
