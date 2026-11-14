import {
  lifecycleDomain,
  partyIdFromUuid,
  productIdOf,
  type ProductState,
  RECALL_AUTHORIZATION_TYPES,
  type RecallAuthorization,
  recallReasonHash,
} from '@dpp/shared';
import { verifyTypedData, Wallet } from 'ethers';
import { recordingAudit } from '../../../../test/support/identity-fakes.js';
import { inMemoryNotifier } from '../../../../test/support/notification-fakes.js';
import { InMemoryProducts, RecordingAlerts } from '../../../../test/support/product-fakes.js';
import { TEST_REGISTRAR_KEY, TestClock } from '../../../../test/support/test-config.js';
import { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { AnomalyAlerts } from '../../audit/application/anomaly-alerts.service.js';
import type { ChainEvent } from '../../chain-sync/index.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import type { OrganizationRef } from '../../organizations/index.js';
import { ProductDirectory } from '../../products/application/product-directory.service.js';
import type { ProductRecord } from '../../products/domain/product.js';
import type { RecallRecord } from '../domain/recall.js';
import { LifecycleProjector, UNKNOWN_RECALL_REASON } from './lifecycle.projector.js';
import type { LifecycleChain } from './ports/lifecycle-chain.port.js';
import type { PendingRecall, RecallRepository } from './ports/recall.repository.js';
import { PrepareRecall } from './recall.use-cases.js';

const MAKER = '0199a3b2-7c4d-7e8f-9a0b-0000000000a1';
const OTHER_MAKER = '0199a3b2-7c4d-7e8f-9a0b-0000000000a7';
const SHOP = '0199a3b2-7c4d-7e8f-9a0b-0000000000a2';
const BUYER = '0199a3b2-7c4d-7e8f-9a0b-0000000000b1';
const CONTRACT = '0xa513e6e4b8f2a923d98304ec87f64353c4d5c853';
const REASON = 'Pin có nguy cơ phồng khi sạc nhanh, ngừng sử dụng ngay.';
const scope = new TransactionScope({});

class InMemoryRecalls implements RecallRepository {
  readonly rows = new Map<string, RecallRecord>();

  async savePending(recalls: readonly PendingRecall[]) {
    for (const recall of recalls) {
      const current = this.rows.get(recall.productId);
      this.rows.set(recall.productId, {
        id: current?.id ?? `recall-${this.rows.size + 1}`,
        ...recall,
        recalledAt: null,
        txHash: null,
        confirmed: false,
      });
    }
  }

  async findByProduct(productId: string) {
    return this.rows.get(productId) ?? null;
  }

  async confirm(productId: string, reasonHash: string, chain: { txHash: string; at: Date }) {
    const row = this.rows.get(productId);
    if (!row || row.reasonHash !== reasonHash) {
      return false;
    }
    this.rows.set(productId, {
      ...row,
      confirmed: true,
      txHash: chain.txHash,
      recalledAt: chain.at,
    });
    return true;
  }

  async confirmWithoutReason(
    recall: { productId: string; issuerOrgId: string; reasonHash: string; reason: string },
    chain: { txHash: string; at: Date },
  ) {
    this.rows.set(recall.productId, {
      id: `recall-${this.rows.size + 1}`,
      ...recall,
      confirmed: true,
      txHash: chain.txHash,
      recalledAt: chain.at,
    });
  }
}

function product(serial: string, overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: `0199a3b2-7c4d-7e8f-9a0b-${serial.padStart(12, '0')}`,
    chainProductId: productIdOf(partyIdFromUuid(MAKER), serial),
    serialNumber: serial,
    publicCode: `K7M2PQ9X${serial.padStart(4, '0').slice(-4)}`,
    modelName: 'Laptop ABC Pro 14',
    description: null,
    manufacturedOn: '2026-10-01',
    warrantyMonths: 24,
    metadataHash: `0x${'ab'.repeat(32)}`,
    issuerOrgId: MAKER,
    productState: 'AT_RETAIL',
    currentCustodianPartyId: SHOP,
    pendingCustodianPartyId: null,
    currentOwnerPartyId: null,
    createdTxHash: `0x${'01'.repeat(32)}`,
    syncStatus: 'CONFIRMED',
    onchainCreatedAt: new Date('2026-10-28T08:00:00Z'),
    createdAt: new Date('2026-10-28T08:00:00Z'),
    ...overrides,
  };
}

function setup() {
  const products = new InMemoryProducts();
  const clock = new TestClock();
  const directory = new ProductDirectory(products, clock);
  const recalls = new InMemoryRecalls();
  const alerts = new RecordingAlerts();
  const { audit, writer } = recordingAudit();
  const { notifier, notifications } = inMemoryNotifier();
  const closed: string[] = [];
  const onProductClosed = async (productId: string) => {
    closed.push(productId);
    return 1;
  };
  const projector = new LifecycleProjector(
    recalls,
    directory,
    { onProductClosed },
    { onProductClosed },
    notifier,
    new AnomalyAlerts(alerts),
    audit,
  );
  const signer = new Wallet(TEST_REGISTRAR_KEY);
  const chain: LifecycleChain = {
    chainId: 31337,
    contractAddress: CONTRACT,
    signRecall: (authorization) =>
      signer.signTypedData(lifecycleDomain(31337, CONTRACT), RECALL_AUTHORIZATION_TYPES, {
        ...authorization,
      }),
  };
  const organization: OrganizationRef = {
    id: MAKER,
    name: 'Công ty ABC',
    taxCode: '0318765432',
    orgType: 'MANUFACTURER',
    authStatus: 'AUTHORIZED',
    address: null,
    partyId: partyIdFromUuid(MAKER),
  };
  const access = {
    require: async () => ({ organization, wallet: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' }),
  };
  const prepare = new PrepareRecall(recalls, chain, clock, access, directory, audit);
  return { products, recalls, alerts, writer, notifications, closed, projector, prepare, signer };
}

function lifecycleEvent(eventName: string, row: ProductRecord, args: Record<string, string>) {
  return {
    contractName: 'ProductLifecycle',
    contractAddress: CONTRACT,
    eventName,
    args: { productId: row.chainProductId, ...args },
    correlationKey: row.chainProductId,
    chainProductId: row.chainProductId,
    chainId: 31337,
    blockNumber: 120n,
    blockHash: `0x${'0c'.repeat(32)}`,
    blockTimestamp: new Date('2026-11-10T03:00:00Z'),
    txHash: `0x${'0d'.repeat(32)}`,
    txIndex: 0,
    logIndex: 0,
    actorAddress: null,
    eventId: 'event-1',
  } satisfies ChainEvent;
}

const client = { ipAddress: '127.0.0.1', userAgent: 'vitest' };
const user: AuthenticatedUser = {
  id: 'user-1',
  email: 'daidien@abc.vn',
  fullName: 'Đại diện ABC',
  systemRole: 'USER',
};

describe('PrepareRecall (RCL-01 bước 1)', () => {
  it('lưu lý do chờ ký cho cả lô và ký giấy phép đúng nhà sản xuất, danh sách, hash lý do', async () => {
    const { products, recalls, prepare, signer, writer } = setup();
    const atShop = product('1');
    const sold = product('2', {
      productState: 'SOLD',
      currentCustodianPartyId: BUYER,
      currentOwnerPartyId: BUYER,
    });
    products.rows.push(atShop, sold);

    const view = await prepare.execute(
      user,
      { productIds: [atShop.id, sold.id, atShop.id], reason: `  ${REASON}\r\n` },
      client,
    );

    expect(view.productIds).toEqual([atShop.chainProductId, sold.chainProductId]);
    expect(view.reasonHash).toBe(recallReasonHash(REASON));
    expect(view.products.map((item) => item.serialNumber)).toEqual(['1', '2']);
    const authorization: RecallAuthorization = {
      issuerId: partyIdFromUuid(MAKER),
      productIds: view.productIds,
      reasonHash: view.reasonHash,
      deadline: BigInt(view.deadline),
    };
    expect(
      verifyTypedData(
        lifecycleDomain(31337, CONTRACT),
        RECALL_AUTHORIZATION_TYPES,
        authorization,
        view.signature,
      ),
    ).toBe(signer.address);
    expect([...recalls.rows.values()].map((row) => [row.reason, row.confirmed])).toEqual([
      [REASON, false],
      [REASON, false],
    ]);
    expect(writer.entries.at(-1)?.action).toBe('RECALL_AUTHORIZED');
  });

  it.each<[string, Partial<ProductRecord>, string]>([
    ['sản phẩm của nhà sản xuất khác', { issuerOrgId: OTHER_MAKER }, 'không thuộc doanh nghiệp'],
    ['bản nháp', { syncStatus: 'PENDING', productState: null }, 'chưa ghi lên blockchain'],
    ['đã thu hồi', { productState: 'RECALLED' }, 'đã bị thu hồi'],
    ['đã báo mất', { productState: 'LOST_STOLEN' }, 'đã được báo mất'],
  ])('từ chối %s', async (_label, overrides, message) => {
    const { products, recalls, prepare } = setup();
    const row = product('1', overrides);
    products.rows.push(row);
    await expect(
      prepare.execute(user, { productIds: [row.id], reason: REASON }, client),
    ).rejects.toThrow(message);
    expect(recalls.rows.size).toBe(0);
  });
});

describe('LifecycleProjector (M10)', () => {
  it('ProductRecalled: chốt lý do, báo chủ sở hữu và nhà bán lẻ đang giữ, huỷ yêu cầu đang chờ', async () => {
    const { products, recalls, notifications, closed, projector, writer } = setup();
    const atShop = product('1');
    const sold = product('2', {
      productState: 'SOLD',
      currentCustodianPartyId: BUYER,
      currentOwnerPartyId: BUYER,
    });
    const shipping = product('3', {
      productState: 'IN_DISTRIBUTION',
      currentCustodianPartyId: MAKER,
      pendingCustodianPartyId: SHOP,
    });
    products.rows.push(atShop, sold, shipping);
    const reasonHash = recallReasonHash(REASON);
    await recalls.savePending(
      [atShop, sold, shipping].map((row) => ({
        productId: row.id,
        issuerOrgId: MAKER,
        reason: REASON,
        reasonHash,
      })),
    );

    for (const row of [atShop, sold, shipping]) {
      await projector.project(
        lifecycleEvent('ProductRecalled', row, {
          issuerId: partyIdFromUuid(MAKER),
          reasonHash,
        }),
        scope,
      );
    }

    expect(recalls.rows.get(sold.id)).toMatchObject({
      confirmed: true,
      txHash: `0x${'0d'.repeat(32)}`,
      reason: REASON,
    });
    expect(notifications.typesFor(SHOP)).toEqual(['PRODUCT_RECALLED', 'PRODUCT_RECALLED']);
    expect(notifications.typesFor(BUYER)).toEqual(['PRODUCT_RECALLED']);
    expect(notifications.typesFor(MAKER)).toEqual([]);
    expect(notifications.rows[0]?.payload).toMatchObject({
      product: { id: atShop.id, serialNumber: '1' },
      organizationId: MAKER,
      reason: REASON,
    });
    expect(closed).toEqual([atShop.id, atShop.id, sold.id, sold.id, shipping.id, shipping.id]);
    expect(writer.entries.filter((entry) => entry.action === 'PRODUCT_RECALLED')).toHaveLength(3);
  });

  it('hash lý do không khớp lý do đã lưu: vẫn ghi thu hồi với lý do mặc định và cảnh báo', async () => {
    const { products, recalls, alerts, projector } = setup();
    const row = product('1');
    products.rows.push(row);

    await projector.project(
      lifecycleEvent('ProductRecalled', row, {
        issuerId: partyIdFromUuid(MAKER),
        reasonHash: recallReasonHash('lý do khác'),
      }),
      scope,
    );

    expect(recalls.rows.get(row.id)).toMatchObject({
      confirmed: true,
      reason: UNKNOWN_RECALL_REASON,
    });
    expect(alerts.raised.map((alert) => alert.ruleCode)).toEqual(['RECALL_REASON_MISMATCH']);
  });

  it.each<[string, ProductState]>([
    ['ProductReportedLostStolen', 'LOST_STOLEN'],
    ['ProductRetired', 'RETIRED'],
  ])('%s: huỷ yêu cầu đang chờ, ghi nhật ký, không gửi thông báo', async (eventName) => {
    const { products, notifications, closed, projector, writer } = setup();
    const row = product('1', {
      productState: 'SOLD',
      currentCustodianPartyId: BUYER,
      currentOwnerPartyId: BUYER,
    });
    products.rows.push(row);

    await projector.project(
      lifecycleEvent(eventName, row, { ownerId: partyIdFromUuid(BUYER) }),
      scope,
    );

    expect(closed).toEqual([row.id, row.id]);
    expect(notifications.rows).toHaveLength(0);
    expect(writer.entries.at(-1)?.action).toBe(
      eventName === 'ProductRetired' ? 'PRODUCT_RETIRED' : 'PRODUCT_REPORTED_LOST_STOLEN',
    );
  });

  it('sản phẩm không có trong CSDL: chỉ cảnh báo', async () => {
    const { alerts, projector, closed } = setup();
    await projector.project(
      lifecycleEvent('ProductRetired', product('9'), { ownerId: partyIdFromUuid(BUYER) }),
      scope,
    );
    expect(alerts.raised.map((alert) => alert.ruleCode)).toEqual(['PRODUCT_NOT_IN_DATABASE']);
    expect(closed).toEqual([]);
  });
});
