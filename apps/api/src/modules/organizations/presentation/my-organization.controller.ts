import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type {
  MyOrganizationView,
  OrganizationApplicationAuthorization,
  TrackedTransactionView,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { Client } from '../../../common/http/client-context.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { type AuthenticatedUser, CurrentUser, SessionGuard } from '../../identity/index.js';
import { GetMyOrganization } from '../application/get-my-organization.query.js';
import { RecordOrganizationTransaction } from '../application/record-organization-transaction.use-case.js';
import { SubmitOrganizationApplication } from '../application/submit-organization-application.use-case.js';
import {
  type OrganizationApplicationBody,
  organizationApplicationSchema,
  type OrganizationTransactionBody,
  organizationTransactionSchema,
} from './organizations.schemas.js';

/** ORG-01 và ORG-03 (rút phí hoàn) phía người đại diện doanh nghiệp. */
@Controller('me/organization')
@UseGuards(SessionGuard)
export class MyOrganizationController {
  constructor(
    private readonly getMyOrganization: GetMyOrganization,
    private readonly submitApplication: SubmitOrganizationApplication,
    private readonly recordTransaction: RecordOrganizationTransaction,
  ) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<MyOrganizationView> {
    return this.getMyOrganization.execute(user);
  }

  @Post('application')
  @HttpCode(201)
  apply(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(organizationApplicationSchema)) body: OrganizationApplicationBody,
    @Client() client: ClientContext,
  ): Promise<OrganizationApplicationAuthorization> {
    return this.submitApplication.execute(user, body, client);
  }

  @Post('transactions')
  @HttpCode(202)
  transaction(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(organizationTransactionSchema)) body: OrganizationTransactionBody,
    @Client() client: ClientContext,
  ): Promise<TrackedTransactionView> {
    return this.recordTransaction.execute(user, body.txHash, body.kind, client);
  }
}
