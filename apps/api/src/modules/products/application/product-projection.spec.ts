import { partyIdFromUuid, productIdOf } from '@dpp/shared';
import { InMemoryIdentityStore, recordingAudit } from '../../../../test/support/identity-fakes.js';
import { inMemoryNotifier } from '../../../../test/support/notification-fakes.js';
import { InMemoryProducts, RecordingAlerts } from '../../../../test/support/product-fakes.js';
import { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { AnomalyAlerts } from '../../audit/application/anomaly-alerts.service.js';
import type { ChainEvent, ChainEventArg } from '../../chain-sync/index.js';
import { IdentityDirectory } from '../../identity/application/identity-directory.service.js';
import { ProductPassportProjector } from './product-passport.projector.js';
import { WarrantyManagerProjector } from './warranty-manager.projector.js';

const scope = new TransactionScope({});
const MAKER_ID = '0199a3b2-7c4d-7e8f-9a0b-0000000000a1';
const SHOP_ID = '0199a3b2-7c4d-7e8f-9a0b-0000000000a2';
const ISSUER = partyIdFromUuid(MAKER_ID);
const SHOP = partyIdFromUuid(SHOP_ID);
const ZERO = `0x${'0'.repeat(64)}`;
const METADATA = '0x' + 'ab'.repeat(32);
const STATE = { CREATED: 1, IN_DISTRIBUTION: 2, AT_RETAIL: 3, SOLD: 4, RECALLED: 5 } as const;

let sequence = 0;

/** Event đã finalized; mỗi lần gọi là một log mới (txHash theo `tx`). */
function event(
  eventName: string,
  args: Record<string, ChainEventArg>,
  tx = 1,
  contractName = 'ProductPassport',
): ChainEvent {
  sequence += 1;
  return {
    chainId: 31337,
    contractName,
    contractAddress: '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512',
    eventName,
    args,
    blockNumber: BigInt(40 + tx),
    blockHash: '0x' + 'cd'.repeat(32),
    blockTimestamp: new Date(Date.UTC(2026, 9, 30, 2, tx)),
    txHash: '0x' + tx.toString(16).padStart(64, '0'),
    txIndex: 0,
    logIndex: sequence,
    actorAddress: '0x1111111111111111111111111111111111111111',
    correlationKey: typeof args.productId === 'string' ? args.productId : null,
    chainProductId: typeof args.productId === 'string' ? args.productId : null,
    eventId: `event-${sequence}`,
  };
}

async function setup() {
  const products = new InMemoryProducts();
  const alerts = new RecordingAlerts();
  const store = new InMemoryIdentityStore();
  const { audit, writer } = recordingAudit();
  await store.createOrganizationParty(MAKER_ID);
  await store.createOrganizationParty(SHOP_ID);
  const { partyId: buyerPartyId } = await store.createWithParty({
    email: 'nguoi.mua@gmail.com',
    passwordHash: 'x',
    fullName: 'Người mua',
  });
  const [draft] = await products.createDrafts([
    {
      serialNumber: 'ABC-2026-000128',
      modelName: 'Laptop ABC Pro 14',
      description: null,
      manufacturedOn: '2026-10-01',
      warrantyMonths: 24,
      issuerOrgId: MAKER_ID,
      chainProductId: productIdOf(ISSUER, 'ABC-2026-000128'),
      publicCode: 'K7M2PQ9XRT4W',
      metadataHash: METADATA,
    },
  ]);
  const identity = new IdentityDirectory(store, store);
  const anomalies = new AnomalyAlerts(alerts);
  const { notifier, notifications } = inMemoryNotifier();
  const projector = new ProductPassportProjector(products, identity, anomalies, audit, notifier);
  const warranty = new WarrantyManagerProjector(products, identity, anomalies);
  const productId = draft!.chainProductId;
  const buyer = partyIdFromUuid(buyerPartyId);

  /** Chiếu lần lượt như Indexer, giữ đúng thứ tự log trong giao dịch. */
  async function project(...events: ChainEvent[]) {
    for (const item of events) {
      await (item.contractName === 'WarrantyManager' ? warranty : projector).project(item, scope);
    }
  }

  const steps = {
    registered: (tx = 1) =>
      event(
        'ProductRegistered',
        { productId, issuerId: ISSUER, metadataHash: METADATA, warrantyMonths: 24 },
        tx,
      ),
    dispatched: (tx: number, to = SHOP) => [
      event('CustodyHandoverInitiated', { productId, fromPartyId: ISSUER, toPartyId: to }, tx),
      event(
        'ProductStateChanged',
        { productId, previousState: STATE.CREATED, newState: STATE.IN_DISTRIBUTION },
        tx,
      ),
    ],
    rejected: (tx: number) => [
      event('CustodyHandoverRejected', { productId, fromPartyId: ISSUER, toPartyId: SHOP }, tx),
      event(
        'ProductStateChanged',
        { productId, previousState: STATE.IN_DISTRIBUTION, newState: STATE.CREATED },
        tx,
      ),
    ],
    received: (tx: number) => [
      event('CustodyTransferred', { productId, fromPartyId: ISSUER, toPartyId: SHOP }, tx),
      event(
        'ProductStateChanged',
        { productId, previousState: STATE.IN_DISTRIBUTION, newState: STATE.AT_RETAIL },
        tx,
      ),
    ],
    sold: (tx: number, to = buyer) => [
      event('OwnershipTransferred', { productId, fromPartyId: ZERO, toPartyId: to }, tx),
      event('CustodyTransferred', { productId, fromPartyId: SHOP, toPartyId: to }, tx),
      event(
        'ProductStateChanged',
        { productId, previousState: STATE.AT_RETAIL, newState: STATE.SOLD },
        tx,
      ),
      event(
        'WarrantyActivated',
        {
          productId,
          activatedBy: SHOP,
          activatedAt: 1_793_325_600,
          expiresAt: '1856397600',
          months: 24,
        },
        tx,
        'WarrantyManager',
      ),
    ],
  };

  return {
    products,
    alerts,
    writer,
    notifications,
    project,
    steps,
    draft: draft!,
    buyerPartyId,
    productId,
  };
}

describe('Projector ProductPassport (Worker)', () => {
  beforeEach(() => {
    sequence = 0;
  });

  it('ProductRegistered: bản nháp thành sản phẩm CREATED, nhà sản xuất giữ hàng, có custody đầu tiên', async () => {
    const { products, writer, project, steps, draft } = await setup();

    await project(steps.registered());

    expect(products.only()).toMatchObject({
      syncStatus: 'CONFIRMED',
      productState: 'CREATED',
      currentCustodianPartyId: MAKER_ID,
      createdTxHash: '0x' + '1'.padStart(64, '0'),
      onchainCreatedAt: new Date(Date.UTC(2026, 9, 30, 2, 1)),
    });
    expect(products.custody).toEqual([
      {
        productId: draft.id,
        fromPartyId: null,
        toPartyId: MAKER_ID,
        eventId: 'event-1',
        at: new Date(Date.UTC(2026, 9, 30, 2, 1)),
      },
    ]);
    expect(writer.actions()).toEqual(['PRODUCT_REGISTERED']);
  });

  it('sản phẩm on-chain không có hồ sơ trong CSDL thì tạo cảnh báo, không tạo dòng mới', async () => {
    const { products, alerts, project } = await setup();

    await project(
      event('ProductRegistered', {
        productId: '0x' + '99'.repeat(32),
        issuerId: ISSUER,
        metadataHash: METADATA,
        warrantyMonths: 24,
      }),
    );

    expect(products.rows).toHaveLength(1);
    expect(alerts.raised[0]).toMatchObject({
      ruleCode: 'PRODUCT_NOT_IN_DATABASE',
      severity: 'HIGH',
    });
  });

  it('hash hồ sơ hoặc số tháng bảo hành on-chain khác CSDL thì không công bố hộ chiếu (FAILED)', async () => {
    const { products, alerts, project, productId, draft } = await setup();

    await project(
      event('ProductRegistered', {
        productId,
        issuerId: ISSUER,
        metadataHash: METADATA,
        warrantyMonths: 36,
      }),
    );

    expect(products.only()).toMatchObject({ syncStatus: 'FAILED', productState: null });
    expect(alerts.raised[0]).toMatchObject({
      ruleCode: 'PRODUCT_METADATA_MISMATCH',
      productId: draft.id,
      details: { onchainWarrantyMonths: 36, databaseWarrantyMonths: 24 },
    });
  });

  it('DST-01, DST-02: gửi, bị từ chối, gửi lại rồi nhận; lịch sử custody đủ các bên', async () => {
    const { products, alerts, project, steps } = await setup();
    await project(steps.registered(), ...steps.dispatched(2));
    expect(products.only()).toMatchObject({
      productState: 'IN_DISTRIBUTION',
      pendingCustodianPartyId: SHOP_ID,
      currentCustodianPartyId: MAKER_ID,
    });

    await project(...steps.rejected(3));
    expect(products.only()).toMatchObject({
      productState: 'CREATED',
      pendingCustodianPartyId: null,
    });

    await project(...steps.dispatched(4), ...steps.received(5));
    expect(products.only()).toMatchObject({
      productState: 'AT_RETAIL',
      currentCustodianPartyId: SHOP_ID,
      pendingCustodianPartyId: null,
    });
    expect(products.custody.map((record) => [record.fromPartyId, record.toPartyId])).toEqual([
      [null, MAKER_ID],
      [MAKER_ID, SHOP_ID],
    ]);
    expect(alerts.raised).toEqual([]);
  });

  it('DST-03: bán thì người mua là chủ và giữ hàng, bảo hành ACTIVE theo event WarrantyManager', async () => {
    const { products, alerts, writer, project, steps, buyerPartyId, draft } = await setup();

    await project(
      steps.registered(),
      ...steps.dispatched(2),
      ...steps.received(3),
      ...steps.sold(4),
    );

    expect(products.only()).toMatchObject({
      productState: 'SOLD',
      currentOwnerPartyId: buyerPartyId,
      currentCustodianPartyId: buyerPartyId,
    });
    expect(products.ownership).toMatchObject([
      { fromPartyId: null, toPartyId: buyerPartyId, productId: draft.id },
    ]);
    expect(products.warrantyRows.get(draft.id)).toMatchObject({
      warrantyState: 'ACTIVE',
      activatedByPartyId: SHOP_ID,
      activatedAt: new Date(1_793_325_600_000),
      expiresAt: new Date(1_856_397_600_000),
    });
    expect(alerts.raised).toEqual([]);
    expect(writer.actions()).toEqual(['PRODUCT_REGISTERED', 'PRODUCT_SOLD']);
  });

  it('người mua không có trong CSDL thì không ghi bừa mà tạo cảnh báo', async () => {
    const { products, alerts, project, steps } = await setup();
    const stranger = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000ff');

    await project(steps.registered(), ...steps.dispatched(2), ...steps.received(3));
    await project(...steps.sold(4, stranger).slice(0, 1));

    expect(products.only().productState).toBe('AT_RETAIL');
    expect(alerts.raised[0]).toMatchObject({
      ruleCode: 'PRODUCT_PARTY_UNKNOWN',
      details: { chainPartyId: stranger, eventName: 'OwnershipTransferred' },
    });
  });

  it('ProductStateChanged khác trạng thái vừa chiếu thì cảnh báo; trạng thái vòng đời (M10) thì áp dụng', async () => {
    const { products, alerts, project, steps, productId } = await setup();
    await project(steps.registered());

    await project(
      event('ProductStateChanged', {
        productId,
        previousState: STATE.CREATED,
        newState: STATE.AT_RETAIL,
      }),
    );
    expect(alerts.raised[0]).toMatchObject({
      ruleCode: 'PRODUCT_STATE_MISMATCH',
      details: { onchainState: 'AT_RETAIL', databaseState: 'CREATED' },
    });

    await project(
      ...steps.dispatched(3),
      event('CustodyHandoverCancelled', { productId, fromPartyId: ISSUER, toPartyId: SHOP }, 4),
      event(
        'ProductStateChanged',
        { productId, previousState: STATE.IN_DISTRIBUTION, newState: STATE.RECALLED },
        4,
      ),
    );
    expect(products.only()).toMatchObject({
      productState: 'RECALLED',
      pendingCustodianPartyId: null,
    });
  });
});
