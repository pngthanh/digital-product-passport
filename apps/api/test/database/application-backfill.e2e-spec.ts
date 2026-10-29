import { readFile } from 'node:fs/promises';
import {
  MANUFACTURER_ROLE,
  organizationProfileHash,
  partyIdFromUuid,
  RETAILER_ROLE,
  statusReasonHash,
} from '@dpp/shared';
import type { PrismaClient } from '../../src/infrastructure/database/generated/client.js';
import {
  createRepresentative,
  createTestPrisma,
  randomAddress,
  randomBytes32,
  resetDatabase,
} from '../support/test-database.js';

const MIGRATION = new URL(
  '../../prisma/migrations/20261030000000_organization_applications/migration.sql',
  import.meta.url,
);
const REGISTRY = randomAddress();
const REPRESENTATIVE_WALLET = randomAddress();
const ADMIN_WALLET = randomAddress();

/** Đoạn dựng lại dữ liệu cũ trong migration M5 (giữa hai dấu BEGIN/END BACKFILL). */
async function backfillSql(): Promise<string> {
  const sql = await readFile(MIGRATION, 'utf8');
  const match = /-- BEGIN BACKFILL\n([\s\S]*?)-- END BACKFILL/.exec(sql);
  if (!match?.[1]) {
    throw new Error('Không tìm thấy đoạn BACKFILL trong migration');
  }
  return match[1];
}

/*
 * Máy đã chạy M4 có sẵn đơn bị từ chối rồi nộp lại. Migration M5 phải dựng lại đủ các lần nộp từ
 * blockchain_events: lần cũ còn lý do (lấy từ audit_logs) và phí, lần mới có bản chụp hồ sơ.
 */
describe('Migration M5 dựng lại các lần nộp đơn từ dữ liệu M4', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrisma();
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lần bị từ chối giữ lý do và phí; lần được duyệt có bản chụp khớp hash on-chain', async () => {
    const representative = await createRepresentative(prisma, 'backfill');
    const profile = {
      name: 'Lam Sơn Việt',
      taxCode: '0317584261',
      orgType: 'MANUFACTURER' as const,
      contactEmail: 'lienhe@lamsonviet-tech.vn',
      contactPhone: '02837562468',
      address: 'Lô 18, Đường số 7, KCN Tân Tạo',
    };
    const organization = await prisma.organization.create({
      data: {
        ...profile,
        representativeUserId: representative.id,
        profileHash: organizationProfileHash(profile),
        authStatus: 'AUTHORIZED',
        appliedAt: new Date('2026-10-29T03:00:00Z'),
        approvedAt: new Date('2026-10-29T03:10:00Z'),
      },
    });
    await prisma.party.create({
      data: { id: organization.id, partyType: 'ORGANIZATION', organizationId: organization.id },
    });
    const partyId = partyIdFromUuid(organization.id);
    const reason = 'Địa chỉ trụ sở chưa ghi rõ số lô';
    const tx = { first: randomBytes32(), reject: randomBytes32(), second: randomBytes32() };
    const tx2 = { approve: randomBytes32(), refund: randomBytes32() };

    let block = 100n;
    const event = (
      eventName: string,
      txHash: string,
      args: Record<string, string>,
      actor: string,
    ) => {
      block += 1n;
      return {
        chainId: 10143,
        contractAddress: REGISTRY,
        blockNumber: block,
        blockHash: randomBytes32(),
        blockTimestamp: new Date(Date.UTC(2026, 9, 29, 3, Number(block - 100n))),
        txHash,
        txIndex: 0,
        logIndex: 0,
        eventName,
        correlationKey: partyId,
        actorAddress: actor,
        payload: { contract: 'PartyRegistry', args: { partyId, ...args } },
        finalityStatus: 'FINALIZED' as const,
        finalizedAt: new Date(),
      };
    };
    await prisma.blockchainEvent.createMany({
      data: [
        event(
          'OrganizationApplied',
          tx.first,
          { role: RETAILER_ROLE.toLowerCase(), profileHash: randomBytes32() },
          REPRESENTATIVE_WALLET,
        ),
        event(
          'OrganizationRejected',
          tx.reject,
          { reasonHash: statusReasonHash(reason) },
          ADMIN_WALLET,
        ),
        event('FeeRefunded', tx2.refund, {}, REPRESENTATIVE_WALLET),
        event(
          'OrganizationApplied',
          tx.second,
          { role: MANUFACTURER_ROLE.toLowerCase(), profileHash: organizationProfileHash(profile) },
          REPRESENTATIVE_WALLET,
        ),
        event('OrganizationApproved', tx2.approve, {}, ADMIN_WALLET),
      ],
    });
    const fee = (paidTxHash: string, feeStatus: 'REFUNDED' | 'SETTLED') => ({
      partyId: organization.id,
      action: 'ORG_REGISTRATION' as const,
      amountWei: '8000000000000000000',
      payerAddress: REPRESENTATIVE_WALLET,
      feeStatus,
      paidTxHash,
      paidAt: new Date(),
      ...(feeStatus === 'SETTLED'
        ? { settledTxHash: tx2.approve, settledAt: new Date() }
        : { refundTxHash: tx2.refund, refundedAt: new Date() }),
    });
    await prisma.feePayment.createMany({
      data: [fee(tx.first, 'REFUNDED'), fee(tx.second, 'SETTLED')],
    });
    await prisma.auditLog.create({
      data: {
        action: 'ADMIN_DECISION_PREPARED',
        targetType: 'organization',
        targetId: organization.id,
        metadata: { decision: 'REJECT', reason, reasonHash: statusReasonHash(reason) },
      },
    });

    await prisma.$executeRawUnsafe(await backfillSql());

    const rounds = await prisma.organizationApplication.findMany({
      orderBy: { round: 'asc' },
      include: { feePayment: true },
    });
    expect(rounds).toHaveLength(2);
    expect(rounds[0]).toMatchObject({
      round: 1,
      orgType: 'RETAILER',
      status: 'REJECTED',
      name: null,
      applicantAddress: REPRESENTATIVE_WALLET,
      appliedTxHash: tx.first,
      decisionReason: reason,
      decisionReasonHash: statusReasonHash(reason),
      decidedTxHash: tx.reject,
      decidedByAddress: ADMIN_WALLET,
      feePayment: { paidTxHash: tx.first, feeStatus: 'REFUNDED' },
    });
    expect(rounds[1]).toMatchObject({
      round: 2,
      orgType: 'MANUFACTURER',
      status: 'AUTHORIZED',
      name: profile.name,
      address: profile.address,
      decisionReason: null,
      decidedTxHash: tx2.approve,
      feePayment: { paidTxHash: tx.second, feeStatus: 'SETTLED' },
    });
  });
});
