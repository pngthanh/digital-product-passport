import { Inject, Injectable } from '@nestjs/common';
import {
  type LifecycleNotice,
  type LifecycleState,
  PRODUCT_LIFECYCLE_CONTRACT_NAME,
  type ProductState,
} from '@dpp/shared';
import { ChainEventHistory } from '../../chain-sync/index.js';
import { OrganizationDirectory } from '../../organizations/index.js';
import type { ProductRef } from '../../products/index.js';
import { RECALL_REPOSITORY, type RecallRepository } from './ports/recall.repository.js';

const EVENT_OF: Readonly<Record<LifecycleState, string>> = {
  RECALLED: 'ProductRecalled',
  LOST_STOLEN: 'ProductReportedLostStolen',
  RETIRED: 'ProductRetired',
};

export function isLifecycleState(state: ProductState | null): state is LifecycleState {
  return state === 'RECALLED' || state === 'LOST_STOLEN' || state === 'RETIRED';
}

/**
 * Thông báo trạng thái cuối của sản phẩm cho mọi trang (công khai, chủ sở hữu, nhà sản xuất): lúc
 * nào, giao dịch nào; thu hồi kèm lý do và tên nhà sản xuất. Không có thông tin chủ sở hữu.
 */
@Injectable()
export class LifecycleNotices {
  constructor(
    @Inject(RECALL_REPOSITORY) private readonly recalls: RecallRepository,
    private readonly history: ChainEventHistory,
    private readonly organizations: OrganizationDirectory,
  ) {}

  async of(product: ProductRef): Promise<LifecycleNotice | null> {
    const state = product.productState;
    if (!isLifecycleState(state)) {
      return null;
    }
    const [events, recall] = await Promise.all([
      this.history.ofCorrelation(PRODUCT_LIFECYCLE_CONTRACT_NAME, product.chainProductId),
      state === 'RECALLED' ? this.recalls.findByProduct(product.id) : Promise.resolve(null),
    ]);
    const event = events.findLast((candidate) => candidate.eventName === EVENT_OF[state]);
    const confirmed = recall?.confirmed ? recall : null;
    const issuer = confirmed
      ? (await this.organizations.describe([confirmed.issuerOrgId])).get(confirmed.issuerOrgId)
      : undefined;
    return {
      state,
      at: (confirmed?.recalledAt ?? event?.blockTimestamp)?.toISOString() ?? null,
      txHash: confirmed?.txHash ?? event?.txHash ?? null,
      recall: confirmed
        ? {
            reason: confirmed.reason,
            reasonHash: confirmed.reasonHash,
            issuerName: issuer?.name ?? '',
          }
        : null,
    };
  }
}
