import { Inject, Injectable } from '@nestjs/common';
import {
  normalizeBytes32,
  PARTY_REGISTRY_CONTRACT_NAME,
  type PartyRegistryAdminMethod,
  type TrackedTransactionView,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { TRANSACTION_TRACKING, type TransactionTracking } from '../../chain-sync/index.js';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { PersonalWalletRequiredError } from '../domain/organizations.errors.js';

/** ORG-02..04, ORG-06: web báo txHash sau khi ví Admin gửi giao dịch quản trị lên PartyRegistry. */
@Injectable()
export class RecordAdminTransaction {
  constructor(
    @Inject(TRANSACTION_TRACKING) private readonly tracker: TransactionTracking,
    private readonly identity: IdentityDirectory,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    admin: AuthenticatedUser,
    txHash: string,
    method: PartyRegistryAdminMethod,
    client: ClientContext,
  ): Promise<TrackedTransactionView> {
    const actor = await this.identity.actorOf(admin.id);
    if (!actor?.activeWallet) {
      throw new PersonalWalletRequiredError();
    }
    const normalizedHash = normalizeBytes32(txHash);
    const status = await this.tracker.track({
      txHash: normalizedHash,
      contractName: PARTY_REGISTRY_CONTRACT_NAME,
      expectedFrom: actor.activeWallet,
      expectedMethods: [method],
      initiatedByUserId: admin.id,
    });
    await this.audit.record({
      action: AuditAction.ADMIN_TRANSACTION_SUBMITTED,
      actorUserId: admin.id,
      targetType: 'party_registry',
      targetId: null,
      metadata: { txHash: normalizedHash, method },
      client,
    });
    return { txHash: normalizedHash, status };
  }
}
