import { type AuthStatus, partyIdFromUuid, type VerificationContracts } from '@dpp/shared';
import { describe, expect, it } from 'vitest';
import { RecordingAlerts } from '../../../../test/support/product-fakes.js';
import { TestClock } from '../../../../test/support/test-config.js';
import { AnomalyAlerts } from '../../audit/index.js';
import type { OrganizationRef } from '../../organizations/index.js';
import type { ProductRef, WarrantyRef } from '../../products/index.js';
import {
  type ChainPassport,
  compareChecks,
  overallStatus,
  type WarrantyFacts,
  warrantyMatches,
} from '../domain/verification.js';
import type { VerificationChain } from './ports/verification-chain.port.js';
import { VERIFICATION_CACHE_MS, VerifyPublicProduct } from './verify-public-product.query.js';

const MAKER = '01900000-0000-7000-8000-000000000001';
const SHOP = '01900000-0000-7000-8000-000000000002';
const BUYER = '01900000-0000-7000-8000-000000000003';
const PRODUCT_ID = `0x${'ab'.repeat(32)}`;
const METADATA = `0x${'cd'.repeat(32)}`;
const party = (uuid: string) => partyIdFromUuid(uuid).toLowerCase();

const CONTRACTS: VerificationContracts = {
  chainId: 31337,
  productPassport: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  partyRegistry: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  warrantyManager: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  serviceTicketManager: null,
  inspectionRegistry: null,
  ownershipTransfer: null,
  productLifecycle: null,
};

function organization(id: string, name: string, authStatus: AuthStatus = 'AUTHORIZED') {
  const ref: OrganizationRef = {
    id,
    name,
    taxCode: '0312345678',
    orgType: 'RETAILER',
    authStatus,
    address: null,
    partyId: partyIdFromUuid(id),
  };
  return ref;
}

/** Sản phẩm đã bán cho người mua cá nhân, bảo hành 24 tháng còn hiệu lực. */
function soldProduct(): ProductRef {
  return {
    id: 'product-1',
    chainProductId: PRODUCT_ID,
    publicCode: 'KMNPQRSTAAAB',
    serialNumber: 'AP500-0001',
    modelName: 'Máy lọc không khí AP-500',
    issuerOrgId: MAKER,
    productState: 'SOLD',
    currentOwnerPartyId: BUYER,
    currentCustodianPartyId: BUYER,
    pendingCustodianPartyId: null,
    warrantyMonths: 24,
    metadataHash: METADATA,
  };
}

const ACTIVATED_AT = new Date('2026-11-01T03:00:00Z');
const EXPIRES_AT = new Date('2028-11-01T03:00:00Z');

function chainPassport(overrides: Partial<ChainPassport> = {}): ChainPassport {
  return {
    metadataHash: METADATA,
    issuerPartyId: party(MAKER),
    productState: 'SOLD',
    warrantyMonths: 24,
    custodianPartyId: party(BUYER),
    pendingCustodianPartyId: null,
    ownerPartyId: party(BUYER),
    ...overrides,
  };
}

function chainWarranty(overrides: Partial<WarrantyFacts> = {}): WarrantyFacts {
  return {
    activatedByPartyId: party(SHOP),
    activatedAt: ACTIVATED_AT,
    expiresAt: EXPIRES_AT,
    suspended: false,
    ...overrides,
  };
}

class FakeVerificationChain implements VerificationChain {
  passport: ChainPassport = chainPassport();
  warranty: WarrantyFacts | null = chainWarranty();
  issuerStatus: AuthStatus | null = 'AUTHORIZED';
  failing = false;
  readonly blocks: bigint[] = [];

  contracts() {
    return CONTRACTS;
  }

  async readPassport(_productId: string, block: bigint) {
    this.blocks.push(block);
    if (this.failing) {
      throw new Error('RPC bận');
    }
    return this.passport;
  }

  async readWarranty() {
    if (this.failing) {
      throw new Error('RPC bận');
    }
    return this.warranty;
  }

  async readOrganizationStatus() {
    if (this.failing) {
      throw new Error('RPC bận');
    }
    return this.issuerStatus;
  }
}

function setup() {
  const product = soldProduct();
  const warranty: WarrantyRef = {
    state: 'ACTIVE',
    expiresAt: EXPIRES_AT,
    activatedAt: ACTIVATED_AT,
    activatedByPartyId: SHOP,
    suspended: false,
  };
  const organizations = new Map([
    [MAKER, organization(MAKER, 'Công ty Sản xuất An Phát')],
    [SHOP, organization(SHOP, 'Siêu thị Điện máy Sao Mai')],
  ]);
  /** Sản phẩm có event sau mốc Indexer (ví dụ giao dịch web vừa báo, đã chiếu). */
  const changedAfterMark = new Set<string>();
  const chain = new FakeVerificationChain();
  const alerts = new RecordingAlerts();
  const clock = new TestClock(new Date('2026-11-14T05:00:00Z'));
  const verify = new VerifyPublicProduct(
    {
      findByPublicCode: async (code) => (code === product.publicCode ? product : null),
      findById: async (id) => (id === product.id ? product : null),
      warrantiesOf: async () => new Map([[product.id, warranty]]),
    },
    {
      describe: async (ids) => new Map([...organizations].filter(([id]) => ids.includes(id))),
    },
    {
      indexedMark: async () => ({ block: 120n, at: new Date('2026-11-14T04:59:58Z') }),
      keysChangedAfter: async () => changedAfterMark,
    },
    chain,
    new AnomalyAlerts(alerts),
    clock,
  );
  return { product, warranty, organizations, changedAfterMark, chain, alerts, clock, verify };
}

describe('VER-01 đối chiếu hộ chiếu công khai với contract', () => {
  it('đọc contract tại block Indexer đã chốt; mọi mục khớp thì không cảnh báo', async () => {
    const { verify, chain, alerts } = setup();

    const view = await verify.execute('KMNPQRSTAAAB');

    expect(view.status).toBe('MATCH');
    expect(view.checks.map((check) => check.key)).toEqual([
      'PROFILE',
      'ISSUER',
      'STATE',
      'CUSTODY',
      'OWNER',
      'WARRANTY',
    ]);
    expect(view.checks.every((check) => check.status === 'MATCH')).toBe(true);
    expect(view.atBlock).toBe('120');
    expect(chain.blocks).toEqual([120n]);
    expect(view.onchain).toMatchObject({
      productState: 'SOLD',
      holder: { kind: 'PERSON', isYou: false },
      hasOwner: true,
      warrantyState: 'ACTIVE',
    });
    expect(view.contracts).toEqual(CONTRACTS);
    expect(alerts.raised).toHaveLength(0);
  });

  it('CSDL lệch chain: báo đúng mục lệch, giá trị trên chain không lộ người mua, cảnh báo Admin', async () => {
    const { verify, chain, alerts } = setup();
    chain.passport = chainPassport({
      productState: 'RECALLED',
      ownerPartyId: party(SHOP),
      custodianPartyId: party(SHOP),
    });

    const view = await verify.execute('KMNPQRSTAAAB');

    expect(view.status).toBe('MISMATCH');
    const failed = view.checks.filter((check) => check.status === 'MISMATCH').map((c) => c.key);
    expect(failed).toEqual(['STATE', 'CUSTODY', 'OWNER']);
    expect(view.onchain?.productState).toBe('RECALLED');
    expect(view.onchain?.holder).toMatchObject({
      kind: 'ORGANIZATION',
      organization: { name: 'Siêu thị Điện máy Sao Mai' },
    });
    expect(alerts.raised).toEqual([
      expect.objectContaining({
        ruleCode: 'PUBLIC_VERIFICATION_MISMATCH',
        severity: 'HIGH',
        productId: 'product-1',
        details: expect.objectContaining({
          checks: 'STATE,CUSTODY,OWNER',
          atBlock: '120',
          databaseState: 'SOLD',
          chainState: 'RECALLED',
        }),
      }),
    ]);
  });

  it('hồ sơ, doanh nghiệp, bảo hành khác chain đều bị phát hiện', async () => {
    const { verify, chain } = setup();
    chain.passport = chainPassport({ metadataHash: `0x${'ee'.repeat(32)}` });
    chain.issuerStatus = 'DISABLED';
    chain.warranty = chainWarranty({ suspended: true });

    const view = await verify.execute('KMNPQRSTAAAB');

    const failed = view.checks.filter((check) => check.status === 'MISMATCH').map((c) => c.key);
    expect(failed).toEqual(['PROFILE', 'ISSUER', 'WARRANTY']);
    expect(view.onchain).toMatchObject({ issuerStatus: 'DISABLED', warrantyState: 'SUSPENDED' });
  });

  it('sản phẩm có giao dịch mới hơn mốc: báo đang cập nhật, không kết luận lệch', async () => {
    const { verify, chain, alerts, changedAfterMark } = setup();
    changedAfterMark.add(PRODUCT_ID);
    chain.passport = chainPassport({ productState: 'RECALLED' });

    const view = await verify.execute('KMNPQRSTAAAB');

    expect(view.status).toBe('SYNCING');
    expect(view.checks.find((check) => check.key === 'STATE')?.status).toBe('SYNCING');
    expect(chain.blocks).toEqual([]);
    expect(alerts.raised).toHaveLength(0);
  });

  it('RPC lỗi: báo chưa đọc được blockchain, không cảnh báo', async () => {
    const { verify, chain, alerts } = setup();
    chain.failing = true;

    const view = await verify.execute('KMNPQRSTAAAB');

    expect(view.status).toBe('UNAVAILABLE');
    expect(view.onchain).toBeNull();
    expect(alerts.raised).toHaveLength(0);
  });

  it('giữ kết quả 15 giây để nhiều người cùng mở một hộ chiếu không dội RPC', async () => {
    const { verify, chain, clock } = setup();

    await Promise.all([verify.execute('KMNPQRSTAAAB'), verify.execute('KMNPQRSTAAAB')]);
    await verify.execute('KMNPQRSTAAAB');
    expect(chain.blocks).toHaveLength(1);

    clock.advance(VERIFICATION_CACHE_MS + 1);
    await verify.execute('KMNPQRSTAAAB');
    expect(chain.blocks).toHaveLength(2);
  });

  it('mã không có sản phẩm đã ghi lên blockchain thì 404', async () => {
    const { verify } = setup();
    await expect(verify.execute('ZZZZZZZZZZZZ')).rejects.toMatchObject({
      kind: 'not_found',
    });
  });
});

describe('so khớp bảo hành', () => {
  const recorded = chainWarranty();
  const before = new Date('2027-01-01T00:00:00Z');
  const after = new Date('2029-01-01T00:00:00Z');

  it('cùng bên kích hoạt, ngày kích hoạt, hạn (tới giây) và cờ tạm dừng', () => {
    expect(warrantyMatches(recorded, chainWarranty(), before)).toBe(true);
    expect(
      warrantyMatches(
        recorded,
        chainWarranty({ expiresAt: new Date(EXPIRES_AT.getTime() + 999) }),
        before,
      ),
    ).toBe(true);
    expect(
      warrantyMatches(recorded, chainWarranty({ activatedByPartyId: party(MAKER) }), before),
    ).toBe(false);
    expect(warrantyMatches(recorded, chainWarranty({ suspended: true }), before)).toBe(false);
    expect(warrantyMatches(recorded, null, before)).toBe(false);
    expect(warrantyMatches(null, null, before)).toBe(true);
  });

  it('đã hết hạn thì cờ tạm dừng không còn ý nghĩa (hết hạn kể cả khi đang sửa)', () => {
    expect(warrantyMatches(recorded, chainWarranty({ suspended: true }), after)).toBe(true);
  });

  it('trạng thái chung: lệch > chưa đọc được > đang cập nhật > khớp', () => {
    const recordedPassport = {
      metadataHash: METADATA,
      issuerPartyId: party(MAKER),
      issuerStatus: 'AUTHORIZED' as const,
      productState: 'SOLD' as const,
      warrantyMonths: 24,
      custodianPartyId: party(BUYER),
      pendingCustodianPartyId: null,
      ownerPartyId: party(BUYER),
      warranty: recorded,
    };
    const checks = compareChecks(
      recordedPassport,
      {
        passport: { kind: 'read', value: chainPassport() },
        warranty: { kind: 'syncing' },
        issuerStatus: { kind: 'unavailable' },
      },
      before,
    );
    expect(overallStatus(checks)).toBe('UNAVAILABLE');
    expect(overallStatus(checks.filter((check) => check.key !== 'ISSUER'))).toBe('SYNCING');
    expect(overallStatus(checks.filter((check) => check.status === 'MATCH'))).toBe('MATCH');
  });
});
