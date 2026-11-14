import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import {
  AnomalyAlerts,
  AnomalyRule,
  AuditRecords,
  type NewAnomalyAlert,
} from '../../audit/index.js';
import { CHAIN_ACTIVITY, type ChainActivity, IndexerProgress } from '../../chain-sync/index.js';
import { IdentityDirectory } from '../../identity/index.js';
import { INSPECTION_STATISTICS, type InspectionStatistics } from '../../inspection/index.js';
import { PRODUCT_STATISTICS, type ProductStatistics } from '../../products/index.js';
import { SERVICE_STATISTICS, type ServiceStatistics } from '../../service/index.js';
import {
  ANOMALY_THRESHOLDS,
  detectionWindows,
  indexerIsLagging,
  indexerLagMinutes,
  wholeDaysBetween,
  wholeMinutesBetween,
} from '../domain/anomaly-thresholds.js';
import { measureIndexerLag } from './indexer-lag.js';
import { CHAIN_HEAD_READER, type ChainHeadReader } from './ports/chain-head.reader.js';

/** Số cảnh báo mới theo luật trong một lần quét. */
export type DetectionSummary = Partial<Record<AnomalyRule, number>>;

/** Chờ lâu thì tính lại sau, không coi là cảnh báo mới (khoá chống trùng của từng luật). */
const REPEAT_HOURS = {
  wallet: 24,
  indexer: 6,
  signIn: 24,
  ownership: 24 * ANOMALY_THRESHOLDS.ownershipWindowDays,
} as const;

/**
 * AUD-03 (M12): Worker chạy các luật phát hiện bất thường theo chu kỳ, độc lập với Indexer. Mỗi
 * luật đọc số liệu qua cổng thống kê của module sở hữu dữ liệu và ghi anomaly_alerts có khoá chống
 * trùng. Một luật lỗi không làm dừng các luật còn lại.
 */
@Injectable()
export class DetectAnomalies {
  private readonly logger = new Logger(DetectAnomalies.name);

  constructor(
    @Inject(CHAIN_ACTIVITY) private readonly chain: ChainActivity,
    @Inject(IndexerProgress) private readonly progress: Pick<IndexerProgress, 'read'>,
    @Inject(CHAIN_HEAD_READER) private readonly head: ChainHeadReader,
    @Inject(AuditRecords) private readonly audit: Pick<AuditRecords, 'signInFailures'>,
    @Inject(PRODUCT_STATISTICS) private readonly products: ProductStatistics,
    @Inject(SERVICE_STATISTICS) private readonly service: ServiceStatistics,
    @Inject(INSPECTION_STATISTICS) private readonly inspections: InspectionStatistics,
    @Inject(IdentityDirectory)
    private readonly identity: Pick<IdentityDirectory, 'partyOfWallet' | 'actorOf'>,
    private readonly alerts: AnomalyAlerts,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async runOnce(): Promise<DetectionSummary> {
    const now = this.clock.now();
    const windows = detectionWindows(now);
    const summary: DetectionSummary = {};
    const raise = async (alert: NewAnomalyAlert) => {
      if (await this.alerts.raise(alert)) {
        summary[alert.ruleCode] = (summary[alert.ruleCode] ?? 0) + 1;
      }
    };
    const rules: [string, () => Promise<void>][] = [
      ['giao dịch treo', () => this.stuckTransactions(windows.stuckBefore, now, raise)],
      ['ví revert liên tục', () => this.revertBursts(windows.revertSince, raise)],
      ['Indexer chậm', () => this.indexerLag(raise)],
      ['đăng nhập sai', () => this.signInFailures(windows.signInSince, raise)],
      ['đổi chủ dồn dập', () => this.ownershipBursts(windows.ownershipSince, raise)],
      ['phiếu sửa quá hạn', () => this.overdueTickets(windows.ticketOpenedBefore, now, raise)],
      ['yêu cầu chờ lâu', () => this.staleRequests(windows.requestBefore, now, raise)],
    ];
    for (const [name, rule] of rules) {
      try {
        await rule();
      } catch (error) {
        this.logger.warn(
          `Luật "${name}" lỗi: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return summary;
  }

  private async stuckTransactions(
    before: Date,
    now: Date,
    raise: (alert: NewAnomalyAlert) => Promise<void>,
  ): Promise<void> {
    for (const tx of await this.chain.stuckTransactions(before)) {
      const partyId = await this.identity.partyOfWallet(tx.fromAddress);
      await raise({
        ruleCode: AnomalyRule.TRANSACTION_STUCK,
        severity: 'MEDIUM',
        ...(partyId ? { partyId } : {}),
        dedupeKey: `tx:${tx.txHash}`,
        details: {
          txHash: tx.txHash,
          wallet: tx.fromAddress,
          contractName: tx.contractName,
          method: tx.method,
          submittedAt: tx.submittedAt.toISOString(),
          waitingMinutes: wholeMinutesBetween(tx.submittedAt, now),
        },
      });
    }
  }

  private async revertBursts(
    since: Date,
    raise: (alert: NewAnomalyAlert) => Promise<void>,
  ): Promise<void> {
    const bursts = await this.chain.revertBursts(since, ANOMALY_THRESHOLDS.revertMinCount);
    for (const burst of bursts) {
      const partyId = await this.identity.partyOfWallet(burst.fromAddress);
      await raise({
        ruleCode: AnomalyRule.WALLET_REPEATED_REVERTS,
        severity: 'MEDIUM',
        ...(partyId ? { partyId } : {}),
        dedupeKey: `wallet:${burst.fromAddress.toLowerCase()}`,
        repeatAfterHours: REPEAT_HOURS.wallet,
        details: {
          wallet: burst.fromAddress,
          reverts: burst.reverts,
          windowMinutes: ANOMALY_THRESHOLDS.revertWindowMinutes,
        },
      });
    }
  }

  private async indexerLag(raise: (alert: NewAnomalyAlert) => Promise<void>): Promise<void> {
    const lag = await measureIndexerLag(await this.progress.read(), this.head, true);
    if (
      !lag.indexedBlockTime ||
      !lag.finalizedBlockTime ||
      !indexerIsLagging(lag.indexedBlockTime, lag.finalizedBlockTime)
    ) {
      return;
    }
    await raise({
      ruleCode: AnomalyRule.INDEXER_LAGGING,
      severity: 'HIGH',
      dedupeKey: 'indexer',
      repeatAfterHours: REPEAT_HOURS.indexer,
      details: {
        indexedBlock: lag.indexedBlock?.toString() ?? null,
        finalizedBlock: lag.finalizedBlock?.toString() ?? null,
        behindBlocks: lag.behindBlocks?.toString() ?? null,
        behindMinutes: indexerLagMinutes(lag.indexedBlockTime, lag.finalizedBlockTime),
        lastIndexedAt: lag.lastIndexedAt?.toISOString() ?? null,
      },
    });
  }

  private async signInFailures(
    since: Date,
    raise: (alert: NewAnomalyAlert) => Promise<void>,
  ): Promise<void> {
    const groups = await this.audit.signInFailures(since, ANOMALY_THRESHOLDS.signInMinFailures);
    for (const group of groups) {
      const partyId = group.userId ? (await this.identity.actorOf(group.userId))?.partyId : null;
      await raise({
        ruleCode: AnomalyRule.SIGN_IN_BRUTE_FORCE,
        severity: 'HIGH',
        ...(partyId ? { partyId } : {}),
        dedupeKey: `email:${group.email}`,
        repeatAfterHours: REPEAT_HOURS.signIn,
        details: {
          email: group.email,
          failures: group.count,
          windowMinutes: ANOMALY_THRESHOLDS.signInWindowMinutes,
          accountExists: group.userId !== null,
        },
      });
    }
  }

  private async ownershipBursts(
    since: Date,
    raise: (alert: NewAnomalyAlert) => Promise<void>,
  ): Promise<void> {
    const bursts = await this.products.ownershipBursts(
      since,
      ANOMALY_THRESHOLDS.ownershipMinChanges,
    );
    for (const burst of bursts) {
      await raise({
        ruleCode: AnomalyRule.RAPID_OWNERSHIP_CHANGES,
        severity: 'HIGH',
        productId: burst.productId,
        dedupeKey: `product:${burst.productId}`,
        repeatAfterHours: REPEAT_HOURS.ownership,
        details: { changes: burst.changes, windowDays: ANOMALY_THRESHOLDS.ownershipWindowDays },
      });
    }
  }

  private async overdueTickets(
    before: Date,
    now: Date,
    raise: (alert: NewAnomalyAlert) => Promise<void>,
  ): Promise<void> {
    for (const ticket of await this.service.ticketsOpenedBefore(before)) {
      await raise({
        ruleCode: AnomalyRule.SERVICE_TICKET_OVERDUE,
        severity: 'LOW',
        productId: ticket.productId,
        partyId: ticket.serviceCenterOrgId,
        dedupeKey: `service-ticket:${ticket.requestId}`,
        details: {
          requestId: ticket.requestId,
          openedAt: ticket.since.toISOString(),
          openDays: wholeDaysBetween(ticket.since, now),
        },
      });
    }
  }

  private async staleRequests(
    before: Date,
    now: Date,
    raise: (alert: NewAnomalyAlert) => Promise<void>,
  ): Promise<void> {
    const [service, inspections] = await Promise.all([
      this.service.requestsWaitingSince(before),
      this.inspections.requestsWaitingSince(before),
    ]);
    const items = [
      ...service.map((item) => ({
        kind: 'SERVICE',
        requestId: item.requestId,
        productId: item.productId,
        organizationId: item.serviceCenterOrgId,
        since: item.since,
      })),
      ...inspections.map((item) => ({
        kind: 'INSPECTION',
        requestId: item.requestId,
        productId: item.productId,
        organizationId: item.inspectorOrgId,
        since: item.since,
      })),
    ];
    for (const item of items) {
      await raise({
        ruleCode: AnomalyRule.REQUEST_STALE,
        severity: 'LOW',
        productId: item.productId,
        partyId: item.organizationId,
        dedupeKey: `${item.kind.toLowerCase()}-request:${item.requestId}`,
        details: {
          kind: item.kind,
          requestId: item.requestId,
          requestedAt: item.since.toISOString(),
          waitingDays: wholeDaysBetween(item.since, now),
        },
      });
    }
  }
}
