import { Inject, Injectable } from '@nestjs/common';
import {
  MANUFACTURER_PASSPORT_METHODS,
  normalizeBytes32,
  PRODUCT_PASSPORT_CONTRACT_NAME,
  RETAILER_PASSPORT_METHODS,
  type TrackedTransactionView,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { TRANSACTION_TRACKING, type TransactionTracking } from '../../chain-sync/index.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import {
  ManufacturerAccess,
  type OrganizationActor,
  RetailerAccess,
} from './organization-access.service.js';

/**
 * Web báo txHash sau khi ví gửi giao dịch lên ProductPassport. API kiểm tra giao dịch gửi từ đúng
 * ví, tới đúng contract, gọi đúng nhóm hàm của vai trò rồi theo dõi tới khi finalized; Indexer vẫn
 * chiếu nếu web không kịp báo.
 */
abstract class RecordPassportTransaction {
  protected constructor(
    private readonly tracker: TransactionTracking,
    private readonly audit: AuditTrail,
    private readonly methods: readonly string[],
  ) {}

  protected abstract actor(user: AuthenticatedUser): Promise<OrganizationActor>;

  async execute(
    user: AuthenticatedUser,
    txHash: string,
    client: ClientContext,
  ): Promise<TrackedTransactionView> {
    const { organization, wallet } = await this.actor(user);
    const normalizedHash = normalizeBytes32(txHash);
    const status = await this.tracker.track({
      txHash: normalizedHash,
      contractName: PRODUCT_PASSPORT_CONTRACT_NAME,
      expectedFrom: wallet,
      expectedMethods: [...this.methods],
      initiatedByUserId: user.id,
    });
    await this.audit.record({
      action: AuditAction.PRODUCT_TRANSACTION_SUBMITTED,
      actorUserId: user.id,
      targetType: 'organization',
      targetId: organization.id,
      metadata: { txHash: normalizedHash, methods: this.methods.join(',') },
      client,
    });
    return { txHash: normalizedHash, status };
  }
}

/** Nhà sản xuất: registerProducts (PRD-01, PRD-02), dispatchCustody, cancelDispatch (DST-01). */
@Injectable()
export class RecordProductTransaction extends RecordPassportTransaction {
  constructor(
    @Inject(TRANSACTION_TRACKING) tracker: TransactionTracking,
    audit: AuditTrail,
    private readonly access: ManufacturerAccess,
  ) {
    super(tracker, audit, MANUFACTURER_PASSPORT_METHODS);
  }

  protected actor(user: AuthenticatedUser): Promise<OrganizationActor> {
    return this.access.require(user);
  }
}

/** Nhà bán lẻ: confirmCustodyReceipt, rejectCustodyReceipt (DST-02), sellAndActivateWarranty (DST-03). */
@Injectable()
export class RecordInventoryTransaction extends RecordPassportTransaction {
  constructor(
    @Inject(TRANSACTION_TRACKING) tracker: TransactionTracking,
    audit: AuditTrail,
    private readonly access: RetailerAccess,
  ) {
    super(tracker, audit, RETAILER_PASSPORT_METHODS);
  }

  protected actor(user: AuthenticatedUser): Promise<OrganizationActor> {
    return this.access.require(user);
  }
}
