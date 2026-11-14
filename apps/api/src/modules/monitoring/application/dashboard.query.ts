import { Inject, Injectable } from '@nestjs/common';
import type { DashboardStatistics } from '@dpp/shared';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { AuditRecords } from '../../audit/index.js';
import { CHAIN_ACTIVITY, type ChainActivity, IndexerProgress } from '../../chain-sync/index.js';
import { IDENTITY_STATISTICS, type IdentityStatistics } from '../../identity/index.js';
import { INSPECTION_STATISTICS, type InspectionStatistics } from '../../inspection/index.js';
import { ORGANIZATION_STATISTICS, type OrganizationStatistics } from '../../organizations/index.js';
import { PRODUCT_STATISTICS, type ProductStatistics } from '../../products/index.js';
import { SERVICE_STATISTICS, type ServiceStatistics } from '../../service/index.js';
import { TRANSFER_STATISTICS, type TransferStatistics } from '../../transfer/index.js';
import { measureIndexerLag } from './indexer-lag.js';
import { CHAIN_HEAD_READER, type ChainHeadReader } from './ports/chain-head.reader.js';

/** Ngày trên biểu đồ hoạt động tính theo giờ Việt Nam. */
export const DASHBOARD_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const ACTIVITY_DAYS = 14;
export const TRANSACTION_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: DASHBOARD_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `ACTIVITY_DAYS` ngày tính tới hôm nay (giờ Việt Nam), cũ nhất trước, ngày trống là 0. */
export function activityDays(
  now: Date,
  counts: readonly { day: string; events: number }[],
): { day: string; events: number }[] {
  const byDay = new Map(counts.map((item) => [item.day, item.events]));
  return Array.from({ length: ACTIVITY_DAYS }, (_, index) => {
    const day = dayFormat.format(new Date(now.getTime() - (ACTIVITY_DAYS - 1 - index) * DAY_MS));
    return { day, events: byDay.get(day) ?? 0 };
  });
}

/**
 * AUD-02 (M12): số liệu toàn hệ thống cho Admin. Mỗi module tự đếm bảng của mình qua cổng thống kê
 * xuất ở index.ts; ở đây chỉ gộp lại.
 */
@Injectable()
export class GetDashboardStatistics {
  constructor(
    @Inject(IDENTITY_STATISTICS) private readonly identity: IdentityStatistics,
    @Inject(ORGANIZATION_STATISTICS) private readonly organizations: OrganizationStatistics,
    @Inject(PRODUCT_STATISTICS) private readonly products: ProductStatistics,
    @Inject(SERVICE_STATISTICS) private readonly service: ServiceStatistics,
    @Inject(INSPECTION_STATISTICS) private readonly inspections: InspectionStatistics,
    @Inject(TRANSFER_STATISTICS) private readonly transfers: TransferStatistics,
    @Inject(CHAIN_ACTIVITY) private readonly chain: ChainActivity,
    @Inject(AuditRecords) private readonly audit: Pick<AuditRecords, 'openAlertsBySeverity'>,
    @Inject(IndexerProgress) private readonly progress: Pick<IndexerProgress, 'read'>,
    @Inject(CHAIN_HEAD_READER) private readonly head: ChainHeadReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<DashboardStatistics> {
    const now = this.clock.now();
    const [
      accounts,
      organizations,
      products,
      service,
      inspections,
      transfers,
      transactions,
      events,
      alerts,
      progress,
    ] = await Promise.all([
      this.identity.accounts(),
      this.organizations.byTypeAndStage(),
      this.products.summary(now),
      this.service.summary(),
      this.inspections.summary(),
      this.transfers.summary(),
      this.chain.transactions(new Date(now.getTime() - TRANSACTION_WINDOW_DAYS * DAY_MS)),
      this.chain.dailyEvents(new Date(now.getTime() - ACTIVITY_DAYS * DAY_MS), DASHBOARD_TIME_ZONE),
      this.audit.openAlertsBySeverity(),
      this.progress.read(),
    ]);
    const lag = await measureIndexerLag(progress, this.head, false);
    return {
      generatedAt: now.toISOString(),
      accounts,
      organizations,
      products: { drafts: products.drafts, byState: products.byState },
      warranties: products.warranties,
      service,
      inspections,
      transfers,
      transactions,
      activity: activityDays(now, events),
      indexer: {
        behindBlocks: lag.behindBlocks?.toString() ?? null,
        lastIndexedAt: lag.lastIndexedAt?.toISOString() ?? null,
      },
      alerts,
    };
  }
}
