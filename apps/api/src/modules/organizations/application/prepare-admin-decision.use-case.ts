import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminDecision,
  type AdminDecisionCall,
  partyIdFromUuid,
  statusReasonHash,
  toChecksumAddress,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { decisionAllowed, stageOf } from '../domain/organization.js';
import {
  DecisionNotAllowedError,
  OrganizationChainNotConfiguredError,
  OrganizationNotFoundError,
  PersonalWalletRequiredError,
} from '../domain/organizations.errors.js';
import { ORGANIZATION_CHAIN, type OrganizationChain } from './ports/organization-chain.port.js';
import {
  ORGANIZATION_APPLICATION_REPOSITORY,
  type OrganizationApplicationRepository,
} from './ports/organization-application.repository.js';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from './ports/organization.repository.js';

/**
 * ORG-03/04 bước 1: lưu lý do vào CSDL, trả hash lý do để ví Admin gửi rejectOrganization
 * hoặc disableOrganization. Contract chỉ lưu hash nên nội dung lý do không lộ on-chain.
 * Lý do từ chối còn được giữ ở đúng lần nộp đơn, nên nộp lại cũng không mất.
 */
@Injectable()
export class PrepareAdminDecision {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    @Inject(ORGANIZATION_CHAIN) private readonly chain: OrganizationChain,
    @Inject(ORGANIZATION_APPLICATION_REPOSITORY)
    private readonly applications: OrganizationApplicationRepository,
    private readonly identity: IdentityDirectory,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    admin: AuthenticatedUser,
    organizationId: string,
    decision: AdminDecision,
    reason: string,
    client: ClientContext,
  ): Promise<AdminDecisionCall> {
    const contractAddress = this.chain.contractAddress;
    if (!contractAddress) {
      throw new OrganizationChainNotConfiguredError();
    }
    const actor = await this.identity.actorOf(admin.id);
    if (!actor?.activeWallet) {
      throw new PersonalWalletRequiredError();
    }
    const organization = await this.organizations.findById(organizationId);
    if (!organization) {
      throw new OrganizationNotFoundError();
    }
    const stage = stageOf(organization);
    if (!decisionAllowed(stage, decision)) {
      throw new DecisionNotAllowedError(decision, stage);
    }

    const trimmed = reason.trim();
    await this.organizations.saveStatusReason(organization.id, trimmed);
    if (decision === 'REJECT') {
      await this.applications.saveDecisionReason(organization.id, trimmed);
    }
    const reasonHash = statusReasonHash(trimmed);
    await this.audit.record({
      action: AuditAction.ADMIN_DECISION_PREPARED,
      actorUserId: admin.id,
      targetType: 'organization',
      targetId: organization.id,
      metadata: { decision, reason: trimmed, reasonHash },
      client,
    });
    return {
      method: decision === 'REJECT' ? 'rejectOrganization' : 'disableOrganization',
      chainId: this.chain.chainId,
      contractAddress: toChecksumAddress(contractAddress),
      wallet: toChecksumAddress(actor.activeWallet),
      partyId: partyIdFromUuid(organization.id),
      reasonHash,
    };
  }
}
