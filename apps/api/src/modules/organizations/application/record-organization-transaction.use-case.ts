import { Inject, Injectable } from '@nestjs/common';
import {
  normalizeBytes32,
  type OrganizationTransactionKind,
  PARTY_REGISTRY_CONTRACT_NAME,
  type TrackedTransactionView,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { TRANSACTION_TRACKING, type TransactionTracking } from '../../chain-sync/index.js';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import {
  OrganizationNotFoundError,
  PersonalWalletRequiredError,
} from '../domain/organizations.errors.js';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from './ports/organization.repository.js';

/**
 * ORG-01/03: web báo txHash sau khi ví cá nhân gửi applyOrganization hoặc withdrawRefund.
 * API kiểm tra giao dịch gửi từ đúng ví, tới đúng contract, gọi đúng hàm rồi theo dõi tới khi finalized.
 */
@Injectable()
export class RecordOrganizationTransaction {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    @Inject(TRANSACTION_TRACKING) private readonly tracker: TransactionTracking,
    private readonly identity: IdentityDirectory,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    txHash: string,
    kind: OrganizationTransactionKind,
    client: ClientContext,
  ): Promise<TrackedTransactionView> {
    const organization = await this.organizations.findByRepresentative(user.id);
    if (!organization) {
      throw new OrganizationNotFoundError();
    }
    const actor = await this.identity.actorOf(user.id);
    if (!actor?.activeWallet) {
      throw new PersonalWalletRequiredError();
    }
    const normalizedHash = normalizeBytes32(txHash);
    const status = await this.tracker.track({
      txHash: normalizedHash,
      contractName: PARTY_REGISTRY_CONTRACT_NAME,
      expectedFrom: actor.activeWallet,
      expectedMethods: [kind],
      initiatedByUserId: user.id,
    });
    await this.audit.record({
      action: AuditAction.ORG_TRANSACTION_SUBMITTED,
      actorUserId: user.id,
      targetType: 'organization',
      targetId: organization.id,
      metadata: { txHash: normalizedHash, method: kind },
      client,
    });
    return { txHash: normalizedHash, status };
  }
}
