import { partyIdFromUuid, productIdOf } from '@dpp/shared';
import { recordingAudit } from '../../../../test/support/identity-fakes.js';
import { InMemoryProducts, RecordingAlerts } from '../../../../test/support/product-fakes.js';
import { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { AnomalyAlerts } from '../../audit/application/anomaly-alerts.service.js';
import type { ChainEvent } from '../../chain-sync/index.js';
import { ProductPassportProjector } from './product-passport.projector.js';

const scope = new TransactionScope({});
const MAKER_ID = '0199a3b2-7c4d-7e8f-9a0b-0000000000a1';
const ISSUER = partyIdFromUuid(MAKER_ID);
const METADATA = '0x' + 'ab'.repeat(32);

function registered(args: Record<string, string>, eventId = 'event-1'): ChainEvent {
  return {
    chainId: 31337,
    contractName: 'ProductPassport',
    contractAddress: '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512',
    eventName: 'ProductRegistered',
    args,
    blockNumber: 42n,
    blockHash: '0x' + 'cd'.repeat(32),
    blockTimestamp: new Date('2026-10-30T02:00:00Z'),
    txHash: '0x' + '0f'.repeat(32),
    txIndex: 0,
    logIndex: 0,
    actorAddress: '0x1111111111111111111111111111111111111111',
    correlationKey: args.productId ?? null,
    chainProductId: args.productId ?? null,
    eventId,
  };
}

async function setup() {
  const products = new InMemoryProducts();
  const alerts = new RecordingAlerts();
  const { audit, writer } = recordingAudit();
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
  const projector = new ProductPassportProjector(products, new AnomalyAlerts(alerts), audit);
  return { products, alerts, writer, projector, draft: draft! };
}

describe('Projector ProductPassport (Worker)', () => {
  it('ProductRegistered: bản nháp thành sản phẩm CREATED, nhà sản xuất giữ hàng, có custody đầu tiên', async () => {
    const { products, writer, projector, draft } = await setup();

    await projector.project(
      registered({ productId: draft.chainProductId, issuerId: ISSUER, metadataHash: METADATA }),
      scope,
    );

    expect(products.only()).toMatchObject({
      syncStatus: 'CONFIRMED',
      productState: 'CREATED',
      currentCustodianPartyId: MAKER_ID,
      createdTxHash: '0x' + '0f'.repeat(32),
      onchainCreatedAt: new Date('2026-10-30T02:00:00Z'),
    });
    expect(products.custody).toEqual([
      { productId: draft.id, toPartyId: MAKER_ID, eventId: 'event-1' },
    ]);
    expect(writer.actions()).toEqual(['PRODUCT_REGISTERED']);
  });

  it('sản phẩm on-chain không có hồ sơ trong CSDL thì tạo cảnh báo, không tạo dòng mới', async () => {
    const { products, alerts, projector } = await setup();

    await projector.project(
      registered({ productId: '0x' + '99'.repeat(32), issuerId: ISSUER, metadataHash: METADATA }),
      scope,
    );

    expect(products.rows).toHaveLength(1);
    expect(alerts.raised[0]).toMatchObject({
      ruleCode: 'PRODUCT_NOT_IN_DATABASE',
      severity: 'HIGH',
    });
  });

  it('hash hồ sơ on-chain khác CSDL thì không công bố hộ chiếu (FAILED) và tạo cảnh báo', async () => {
    const { products, alerts, projector, draft } = await setup();

    await projector.project(
      registered({
        productId: draft.chainProductId,
        issuerId: ISSUER,
        metadataHash: '0x' + 'ee'.repeat(32),
      }),
      scope,
    );

    expect(products.only()).toMatchObject({ syncStatus: 'FAILED', productState: null });
    expect(alerts.raised[0]).toMatchObject({
      ruleCode: 'PRODUCT_METADATA_MISMATCH',
      productId: draft.id,
    });
  });
});
