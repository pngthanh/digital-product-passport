import { Inject, Injectable } from '@nestjs/common';
import {
  normalizeBytes32,
  PRODUCT_PASSPORT_CONTRACT_NAME,
  type TrackedTransactionView,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { TRANSACTION_TRACKING, type TransactionTracking } from '../../chain-sync/index.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import { ManufacturerAccess } from './manufacturer-access.service.js';

/**
 * Web báo txHash sau khi ví gửi registerProducts. API kiểm tra giao dịch gửi từ đúng ví, tới đúng
 * contract, gọi đúng hàm rồi theo dõi tới khi finalized; Indexer vẫn chiếu nếu web không kịp báo.
 */
@Injectable()
export class RecordProductTransaction {
  constructor(
    @Inject(TRANSACTION_TRACKING) private readonly tracker: TransactionTracking,
    private readonly access: ManufacturerAccess,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    txHash: string,
    client: ClientContext,
  ): Promise<TrackedTransactionView> {
    const { organization, wallet } = await this.access.require(user);
    const normalizedHash = normalizeBytes32(txHash);
    const status = await this.tracker.track({
      txHash: normalizedHash,
      contractName: PRODUCT_PASSPORT_CONTRACT_NAME,
      expectedFrom: wallet,
      expectedMethods: ['registerProducts'],
      initiatedByUserId: user.id,
    });
    await this.audit.record({
      action: AuditAction.PRODUCT_TRANSACTION_SUBMITTED,
      actorUserId: user.id,
      targetType: 'organization',
      targetId: organization.id,
      metadata: { txHash: normalizedHash, method: 'registerProducts' },
      client,
    });
    return { txHash: normalizedHash, status };
  }
}
