import { ANOMALY_RULES, AUDIT_ACTIONS } from '@dpp/shared';
import { describe, expect, it } from 'vitest';
import { recordingAudit } from '../../../../test/support/identity-fakes.js';
import { RecordingAlerts } from '../../../../test/support/product-fakes.js';
import { TestClock } from '../../../../test/support/test-config.js';
import type { AnomalyAlertRepository } from '../../audit/application/ports/anomaly-alert.repository.js';
import { ReviewAnomalyAlert } from '../../audit/application/review-anomaly-alert.use-case.js';
import type { AnomalyAlertRecord } from '../../audit/domain/audit-records.js';
import { AnomalyAlerts, AnomalyRule, AuditAction } from '../../audit/index.js';
import type { ChainActivity, ContractProgress } from '../../chain-sync/index.js';
import { indexerIsLagging } from '../domain/anomaly-thresholds.js';
import { activityDays } from './dashboard.query.js';
import { DetectAnomalies } from './detect-anomalies.use-case.js';
import type { ChainHeadReader } from './ports/chain-head.reader.js';

const NOW = new Date('2026-11-14T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const WALLET = '0x1111111111111111111111111111111111111111';
const TX = `0x${'aa'.repeat(32)}`;

function checkpoint(block: bigint): ContractProgress {
  return {
    contractName: 'ProductPassport',
    contractAddress: '0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0',
    checkpoint: {
      chainId: 10143,
      contractAddress: '0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0',
      lastObservedBlock: block,
      lastFinalizedBlock: block,
      lastFinalizedBlockHash: `0x${'00'.repeat(32)}`,
      updatedAt: minutesAgo(1),
    },
  };
}

function setup() {
  const writer = new RecordingAlerts();
  const chain: ChainActivity = {
    transactions: async () => {
      throw new Error('không dùng');
    },
    dailyEvents: async () => [],
    stuckTransactions: async () => [
      {
        txHash: TX,
        fromAddress: WALLET,
        contractName: 'ProductPassport',
        method: 'sellAndActivateWarranty',
        submittedAt: minutesAgo(40),
        initiatedByUserId: null,
      },
    ],
    revertBursts: async () => [{ fromAddress: WALLET, reverts: 6 }],
  };
  const blockTimes = new Map<bigint, Date>([
    [100n, minutesAgo(25)],
    [900n, minutesAgo(0)],
  ]);
  const head: ChainHeadReader = {
    finalizedBlock: async () => ({ number: 900n, time: minutesAgo(0) }),
    blockTime: async (block) => blockTimes.get(block) ?? null,
  };
  let failingRule: 'ownership' | null = null;
  const detect = new DetectAnomalies(
    chain,
    { read: async () => [checkpoint(100n)] },
    head,
    {
      signInFailures: async () => [{ email: 'nguyen.an@gmail.com', count: 12, userId: 'user-an' }],
    },
    {
      summary: async () => {
        throw new Error('không dùng');
      },
      ownershipBursts: async () => {
        if (failingRule === 'ownership') {
          throw new Error('CSDL bận');
        }
        return [{ productId: 'product-1', changes: 3 }];
      },
    },
    {
      summary: async () => {
        throw new Error('không dùng');
      },
      ticketsOpenedBefore: async () => [
        {
          requestId: 'service-1',
          productId: 'product-2',
          serviceCenterOrgId: 'center-1',
          since: daysAgo(31),
        },
      ],
      requestsWaitingSince: async () => [
        {
          requestId: 'service-2',
          productId: 'product-3',
          serviceCenterOrgId: 'center-1',
          since: daysAgo(15),
        },
      ],
    },
    {
      summary: async () => {
        throw new Error('không dùng');
      },
      requestsWaitingSince: async () => [
        {
          requestId: 'inspection-1',
          productId: 'product-4',
          inspectorOrgId: 'lab-1',
          since: daysAgo(20),
        },
      ],
    },
    {
      partyOfWallet: async (address) => (address === WALLET ? 'party-of-wallet' : null),
      actorOf: async (userId) =>
        userId === 'user-an'
          ? { userId, partyId: 'party-an', chainPartyId: null, activeWallet: null }
          : null,
    },
    new AnomalyAlerts(writer),
    new TestClock(NOW),
  );
  return {
    detect,
    writer,
    failOwnership: () => {
      failingRule = 'ownership';
    },
  };
}

describe('AUD-03 luật phát hiện bất thường chạy nền', () => {
  it('mỗi luật tạo cảnh báo đúng đối tượng, mức độ và khoá chống trùng', async () => {
    const { detect, writer } = setup();

    const summary = await detect.runOnce();

    const byRule = new Map(
      writer.raised.map((alert) => [`${alert.ruleCode}:${alert.dedupeKey}`, alert]),
    );
    expect(byRule.get(`TRANSACTION_STUCK:tx:${TX}`)).toMatchObject({
      severity: 'MEDIUM',
      partyId: 'party-of-wallet',
      details: { method: 'sellAndActivateWarranty', waitingMinutes: 40 },
    });
    expect(byRule.get(`WALLET_REPEATED_REVERTS:wallet:${WALLET}`)).toMatchObject({
      repeatAfterHours: 24,
      details: { reverts: 6, windowMinutes: 60 },
    });
    expect(byRule.get('INDEXER_LAGGING:indexer')).toMatchObject({
      severity: 'HIGH',
      details: { indexedBlock: '100', finalizedBlock: '900', behindMinutes: 25 },
    });
    expect(byRule.get('SIGN_IN_BRUTE_FORCE:email:nguyen.an@gmail.com')).toMatchObject({
      severity: 'HIGH',
      partyId: 'party-an',
      details: { failures: 12, accountExists: true },
    });
    expect(byRule.get('RAPID_OWNERSHIP_CHANGES:product:product-1')).toMatchObject({
      productId: 'product-1',
      details: { changes: 3, windowDays: 7 },
    });
    expect(byRule.get('SERVICE_TICKET_OVERDUE:service-ticket:service-1')).toMatchObject({
      severity: 'LOW',
      productId: 'product-2',
      partyId: 'center-1',
      details: { openDays: 31 },
    });
    expect(byRule.get('REQUEST_STALE:service-request:service-2')).toMatchObject({
      details: { kind: 'SERVICE', waitingDays: 15 },
    });
    expect(byRule.get('REQUEST_STALE:inspection-request:inspection-1')).toMatchObject({
      partyId: 'lab-1',
      details: { kind: 'INSPECTION', waitingDays: 20 },
    });
    expect(summary).toEqual({
      TRANSACTION_STUCK: 1,
      WALLET_REPEATED_REVERTS: 1,
      INDEXER_LAGGING: 1,
      SIGN_IN_BRUTE_FORCE: 1,
      RAPID_OWNERSHIP_CHANGES: 1,
      SERVICE_TICKET_OVERDUE: 1,
      REQUEST_STALE: 2,
    });
  });

  it('một luật lỗi không làm dừng các luật còn lại', async () => {
    const { detect, writer, failOwnership } = setup();
    failOwnership();

    await detect.runOnce();

    const rules = new Set(writer.raised.map((alert) => alert.ruleCode));
    expect(rules.has(AnomalyRule.RAPID_OWNERSHIP_CHANGES)).toBe(false);
    expect(rules.has(AnomalyRule.REQUEST_STALE)).toBe(true);
  });

  it('Indexer chậm tính theo thời gian của block, không theo việc chain đứng yên', () => {
    expect(indexerIsLagging(minutesAgo(25), minutesAgo(0))).toBe(true);
    expect(indexerIsLagging(minutesAgo(9), minutesAgo(0))).toBe(false);
    // Hardhat không có giao dịch: block đã chiếu chính là block finalized.
    expect(indexerIsLagging(minutesAgo(60), minutesAgo(60))).toBe(false);
  });
});

class InMemoryAlertRepository implements AnomalyAlertRepository {
  readonly alerts = new Map<string, AnomalyAlertRecord>();

  async page() {
    return [...this.alerts.values()];
  }

  async find(id: string) {
    return this.alerts.get(id) ?? null;
  }

  async countByStatus() {
    return { OPEN: 0, ACKNOWLEDGED: 0, DISMISSED: 0 };
  }

  async openBySeverity() {
    return { LOW: 0, MEDIUM: 0, HIGH: 0 };
  }

  async review(
    id: string,
    decision: { decision: 'ACKNOWLEDGED' | 'DISMISSED'; reviewerUserId: string; at: Date },
  ) {
    const alert = this.alerts.get(id);
    if (!alert || alert.status !== 'OPEN') {
      return false;
    }
    this.alerts.set(id, {
      ...alert,
      status: decision.decision,
      reviewedByUserId: decision.reviewerUserId,
      reviewedAt: decision.at,
    });
    return true;
  }
}

function reviewSetup() {
  const repository = new InMemoryAlertRepository();
  repository.alerts.set('alert-1', {
    id: 'alert-1',
    ruleCode: 'SIGN_IN_BRUTE_FORCE',
    severity: 'HIGH',
    status: 'OPEN',
    productId: null,
    partyId: null,
    details: { email: 'nguyen.an@gmail.com' },
    detectedAt: NOW,
    reviewedByUserId: null,
    reviewedAt: null,
  });
  const { audit, writer } = recordingAudit();
  const review = new ReviewAnomalyAlert(repository, audit, new TestClock(NOW));
  const command = {
    alertId: 'alert-1',
    decision: 'ACKNOWLEDGED' as const,
    note: 'Đã gọi cho chủ tài khoản, họ quên mật khẩu.',
    reviewerUserId: 'admin-1',
    client: { ipAddress: '203.0.113.1', userAgent: 'test' },
  };
  return { repository, writer, review, command };
}

describe('AUD-04 Admin xử lý cảnh báo', () => {
  it('chốt cảnh báo đang mở và ghi ghi chú vào audit_logs', async () => {
    const { repository, writer, review, command } = reviewSetup();

    await review.execute(command);

    expect(repository.alerts.get('alert-1')).toMatchObject({
      status: 'ACKNOWLEDGED',
      reviewedByUserId: 'admin-1',
    });
    expect(writer.entries).toEqual([
      expect.objectContaining({
        action: AuditAction.ALERT_REVIEWED,
        actorUserId: 'admin-1',
        targetType: 'anomaly_alert',
        targetId: 'alert-1',
        metadata: expect.objectContaining({
          decision: 'ACKNOWLEDGED',
          note: 'Đã gọi cho chủ tài khoản, họ quên mật khẩu.',
          ruleCode: 'SIGN_IN_BRUTE_FORCE',
        }),
      }),
    ]);
  });

  it('cảnh báo đã xử lý thì báo xung đột; cảnh báo lạ thì 404', async () => {
    const { review, command } = reviewSetup();
    await review.execute(command);

    await expect(review.execute({ ...command, decision: 'DISMISSED' })).rejects.toMatchObject({
      kind: 'conflict',
    });
    await expect(review.execute({ ...command, alertId: 'khong-co' })).rejects.toMatchObject({
      kind: 'not_found',
    });
  });
});

describe('AUD-01, AUD-02', () => {
  it('mã hành động, mã luật ở @dpp/shared trùng khớp với API (web dịch đủ nhãn)', () => {
    expect([...AUDIT_ACTIONS].toSorted()).toEqual(Object.values(AuditAction).toSorted());
    expect([...ANOMALY_RULES].toSorted()).toEqual(Object.values(AnomalyRule).toSorted());
  });

  it('biểu đồ hoạt động có đủ 14 ngày theo giờ Việt Nam, ngày trống là 0', () => {
    const days = activityDays(new Date('2026-11-14T18:30:00Z'), [
      { day: '2026-11-15', events: 7 },
      { day: '2026-11-10', events: 2 },
    ]);
    expect(days).toHaveLength(14);
    expect(days.at(0)?.day).toBe('2026-11-02');
    expect(days.at(-1)).toEqual({ day: '2026-11-15', events: 7 });
    expect(days.find((item) => item.day === '2026-11-10')?.events).toBe(2);
    expect(days.filter((item) => item.events === 0)).toHaveLength(12);
  });
});
