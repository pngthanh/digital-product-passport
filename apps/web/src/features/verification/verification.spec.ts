import type { PublicPassportView, VerificationContracts } from '@dpp/shared';
import { describe, expect, it } from 'vitest';
import {
  type ChainProductView,
  type ChainReceiptView,
  displayedMetadataHash,
  runSelfCheck,
  type SelfCheckReader,
  timelineTransactions,
} from './self-check';
import { onchainValue } from './verification-text';
import { publicVerificationSchema } from './verification.schema';

const MAKER = `0x${'0'.repeat(32)}${'11'.repeat(16)}`;
const SHOP = `0x${'0'.repeat(32)}${'22'.repeat(16)}`;
const BUYER = `0x${'0'.repeat(32)}${'33'.repeat(16)}`;
const PRODUCT = `0x${'ab'.repeat(32)}`;
const TX_REGISTER = `0x${'01'.repeat(32)}`;
const TX_SALE = `0x${'02'.repeat(32)}`;

const CONTRACTS: VerificationContracts = {
  chainId: 10143,
  productPassport: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  partyRegistry: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  warrantyManager: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  serviceTicketManager: null,
  inspectionRegistry: null,
  ownershipTransfer: null,
  productLifecycle: null,
};

function passport(overrides: Partial<PublicPassportView> = {}): PublicPassportView {
  return {
    publicCode: 'KMNPQRSTAAAB',
    serialNumber: 'TV55-2611-00001',
    modelName: 'Tivi Hoà Phát 55 inch',
    description: 'Màn hình 4K',
    manufacturedOn: '2026-10-25',
    warrantyMonths: 12,
    productState: 'SOLD',
    issuer: {
      name: 'Công ty Điện tử Hoà Phát',
      taxCode: '0319876543',
      orgType: 'MANUFACTURER',
      authStatus: 'AUTHORIZED',
      partyId: MAKER,
    },
    holder: { kind: 'PERSON', isYou: false },
    pendingRetailer: null,
    hasOwner: true,
    warranty: {
      state: 'ACTIVE',
      months: 12,
      activatedAt: '2026-11-10T03:00:00.000Z',
      expiresAt: '2027-11-10T03:00:00.000Z',
      activatedBy: null,
      activationTxHash: TX_SALE,
    },
    proof: {
      chainId: 10143,
      contractAddress: CONTRACTS.productPassport,
      productId: PRODUCT,
      metadataHash: `0x${'cd'.repeat(32)}`,
      metadataMatchesHash: true,
      onchainMatches: true,
      registrationTxHash: TX_REGISTER,
      registeredAt: '2026-11-01T03:00:00.000Z',
    },
    journey: [
      {
        kind: 'REGISTERED',
        at: '2026-11-01T03:00:00.000Z',
        txHash: TX_REGISTER,
        from: null,
        to: null,
      },
      { kind: 'SOLD', at: '2026-11-10T03:00:00.000Z', txHash: TX_SALE, from: null, to: null },
      {
        kind: 'WARRANTY_ACTIVATED',
        at: '2026-11-10T03:00:00.000Z',
        txHash: TX_SALE,
        from: null,
        to: null,
      },
    ],
    history: [],
    ...overrides,
  };
}

class FakeReader {
  chain = 10143;
  product: ChainProductView;
  receipts = new Map<string, ChainReceiptView>([
    [
      TX_REGISTER,
      {
        succeeded: true,
        logs: [{ address: CONTRACTS.productPassport, topics: ['0xev', PRODUCT] }],
      },
    ],
    [
      TX_SALE,
      {
        succeeded: true,
        logs: [{ address: CONTRACTS.warrantyManager ?? '', topics: ['0xev', PRODUCT] }],
      },
    ],
  ]);

  constructor(view: PublicPassportView) {
    this.product = {
      issuerPartyId: MAKER,
      metadataHash: displayedMetadataHash(view),
      custodianPartyId: BUYER,
      pendingCustodianPartyId: null,
      ownerPartyId: BUYER,
      state: 'SOLD',
      warrantyMonths: 12,
    };
  }

  async chainId() {
    return this.chain;
  }

  async organizationStatus() {
    return 'AUTHORIZED' as const;
  }

  async warranty() {
    return { state: 'ACTIVE' as const, expiresAt: new Date('2027-11-10T03:00:00.400Z') };
  }

  async receipt(txHash: string) {
    return this.receipts.get(txHash) ?? null;
  }
}

/** Đặt `product` thành hàm của reader (SelfCheckReader.product) nhưng giữ dữ liệu sửa được trong test. */
function readerFor(view: PublicPassportView) {
  const fake = new FakeReader(view);
  const reader: SelfCheckReader = {
    chainId: () => fake.chainId(),
    product: async () => fake.product,
    organizationStatus: () => fake.organizationStatus(),
    warranty: () => fake.warranty(),
    receipt: (hash) => fake.receipt(hash),
  };
  return { fake, reader };
}

const okKeys = (items: { key: string; ok: boolean | null }[]) =>
  Object.fromEntries(items.map((item) => [item.key, item.ok]));

describe('M11 tự kiểm tra bằng trình duyệt (VER-01, VER-02)', () => {
  it('đọc thẳng blockchain: hồ sơ băm lại, trạng thái, bên giữ, chủ, bảo hành, giao dịch đều khớp', async () => {
    const view = passport();
    const { reader } = readerFor(view);
    const progress: string[] = [];

    const items = await runSelfCheck(
      reader,
      { expectedChainId: 10143, passport: view, contracts: CONTRACTS },
      (done, total) => progress.push(`${done}/${total}`),
    );

    expect(okKeys(items)).toEqual({
      NETWORK: true,
      PROFILE: true,
      ISSUER: true,
      STATE: true,
      CUSTODY: true,
      OWNER: true,
      WARRANTY: true,
      TRANSACTIONS: true,
    });
    expect(progress).toEqual(['1/2', '2/2']);
    expect(timelineTransactions(view)).toEqual([TX_REGISTER, TX_SALE]);
  });

  it('trang hiển thị sai một chữ trong hồ sơ hay trạng thái khác chain thì báo lệch', async () => {
    const view = passport();
    const { reader, fake } = readerFor(view);
    fake.product = { ...fake.product, state: 'RECALLED' };

    const items = await runSelfCheck(reader, {
      expectedChainId: 10143,
      passport: { ...view, modelName: 'Tivi Hoà Phát 65 inch' },
      contracts: CONTRACTS,
    });

    expect(okKeys(items)).toMatchObject({ PROFILE: false, STATE: false, OWNER: true });
  });

  it('giao dịch không có thật hoặc do contract lạ phát event thì không được tính', async () => {
    const view = passport();
    const { reader, fake } = readerFor(view);
    fake.receipts.set(TX_SALE, {
      succeeded: true,
      logs: [{ address: '0x000000000000000000000000000000000000dEaD', topics: [PRODUCT] }],
    });

    const items = await runSelfCheck(reader, {
      expectedChainId: 10143,
      passport: view,
      contracts: CONTRACTS,
    });

    const transactions = items.find((item) => item.key === 'TRANSACTIONS');
    expect(transactions).toMatchObject({ ok: false });
    expect(transactions?.detail).toContain('1/2');
  });

  it('RPC thuộc mạng khác thì dừng ngay, không so tiếp', async () => {
    const view = passport();
    const { reader, fake } = readerFor(view);
    fake.chain = 1;

    const items = await runSelfCheck(reader, {
      expectedChainId: 10143,
      passport: view,
      contracts: CONTRACTS,
    });

    expect(items).toEqual([expect.objectContaining({ key: 'NETWORK', ok: false })]);
  });

  it('bên giữ hàng là doanh nghiệp thì so đúng partyId; hàng đang giao so cả nhà bán lẻ sắp nhận', async () => {
    const view = passport({
      productState: 'IN_DISTRIBUTION',
      hasOwner: false,
      warranty: null,
      holder: {
        kind: 'ORGANIZATION',
        organization: { organizationId: '0190', name: 'Hoà Phát', partyId: MAKER },
      },
      pendingRetailer: { name: 'Điện máy Thiên Hoà', partyId: SHOP },
    });
    const { reader, fake } = readerFor(view);
    fake.product = {
      ...fake.product,
      state: 'IN_DISTRIBUTION',
      custodianPartyId: MAKER,
      pendingCustodianPartyId: SHOP,
      ownerPartyId: null,
    };
    reader.warranty = async () => ({ state: null, expiresAt: null });

    const items = await runSelfCheck(reader, {
      expectedChainId: 10143,
      passport: view,
      contracts: CONTRACTS,
    });

    expect(okKeys(items)).toMatchObject({ CUSTODY: true, OWNER: true, WARRANTY: true });
  });
});

describe('khung đối chiếu của máy chủ', () => {
  const verification = {
    status: 'MISMATCH',
    checks: [
      { key: 'PROFILE', status: 'MATCH' },
      { key: 'STATE', status: 'MISMATCH' },
    ],
    onchain: {
      metadataHash: `0x${'cd'.repeat(32)}`,
      issuerPartyId: MAKER,
      issuerStatus: 'AUTHORIZED',
      productState: 'AT_RETAIL',
      holder: {
        kind: 'ORGANIZATION',
        organization: {
          organizationId: '0190a1b2-0000-7000-8000-000000000002',
          name: 'Điện máy Thiên Hoà',
          partyId: SHOP,
        },
      },
      pendingRetailer: null,
      hasOwner: false,
      warrantyState: null,
      warrantyExpiresAt: null,
    },
    atBlock: '120',
    indexedAt: '2026-11-14T05:00:00.000Z',
    checkedAt: '2026-11-14T05:00:01.000Z',
    contracts: CONTRACTS,
  };

  it('nhận đúng dữ liệu API và ghi giá trị trên blockchain của mục lệch', () => {
    const parsed = publicVerificationSchema.parse(verification);
    expect(parsed.status).toBe('MISMATCH');
    expect(onchainValue('STATE', parsed.onchain!)).toBe('Tại cửa hàng');
    expect(onchainValue('CUSTODY', parsed.onchain!)).toBe(
      'Điện máy Thiên Hoà, không có lô hàng đang gửi',
    );
    expect(onchainValue('OWNER', parsed.onchain!)).toBe('chưa có chủ');
    expect(onchainValue('WARRANTY', parsed.onchain!)).toBe('chưa kích hoạt');
  });
});
