import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import type {
  AdminDecisionCall,
  AdminOrganizationList,
  AdminOverview,
  OrganizationStage,
  TrackedTransactionView,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { Client } from '../../../common/http/client-context.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import {
  AdminGuard,
  type AuthenticatedUser,
  CurrentUser,
  SessionGuard,
} from '../../identity/index.js';
import { GetAdminOverview } from '../application/get-admin-overview.query.js';
import { ListOrganizations } from '../application/list-organizations.query.js';
import { PrepareAdminDecision } from '../application/prepare-admin-decision.use-case.js';
import { RecordAdminTransaction } from '../application/record-admin-transaction.use-case.js';
import {
  type AdminDecisionBody,
  adminDecisionSchema,
  type AdminTransactionBody,
  adminTransactionSchema,
  organizationIdSchema,
  stageListSchema,
} from './organizations.schemas.js';

/** Khu Quản trị: ORG-02 duyệt, ORG-03 từ chối, ORG-04 khoá, ORG-06 phí và Treasury. */
@Controller('admin')
@UseGuards(SessionGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly overview: GetAdminOverview,
    private readonly listOrganizations: ListOrganizations,
    private readonly prepareDecision: PrepareAdminDecision,
    private readonly recordTransaction: RecordAdminTransaction,
  ) {}

  @Get('overview')
  getOverview(@CurrentUser() admin: AuthenticatedUser): Promise<AdminOverview> {
    return this.overview.execute(admin);
  }

  @Get('organizations')
  list(
    @Query('stage', new ZodValidationPipe(stageListSchema)) stages: OrganizationStage[],
  ): Promise<AdminOrganizationList> {
    return this.listOrganizations.execute(stages);
  }

  @Post('organizations/:id/decisions')
  @HttpCode(201)
  decide(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(organizationIdSchema)) organizationId: string,
    @Body(new ZodValidationPipe(adminDecisionSchema)) body: AdminDecisionBody,
    @Client() client: ClientContext,
  ): Promise<AdminDecisionCall> {
    return this.prepareDecision.execute(admin, organizationId, body.decision, body.reason, client);
  }

  @Post('transactions')
  @HttpCode(202)
  transaction(
    @CurrentUser() admin: AuthenticatedUser,
    @Body(new ZodValidationPipe(adminTransactionSchema)) body: AdminTransactionBody,
    @Client() client: ClientContext,
  ): Promise<TrackedTransactionView> {
    return this.recordTransaction.execute(admin, body.txHash, body.method, client);
  }
}
