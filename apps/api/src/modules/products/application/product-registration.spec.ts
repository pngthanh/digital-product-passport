import {
  type ProductInput,
  PRODUCT_REGISTRATION_TYPES,
  productIdOf,
  productMetadataHash,
  productPassportDomain,
  PUBLIC_CODE_PATTERN,
  partyIdFromUuid,
} from '@dpp/shared';
import { verifyTypedData, Wallet } from 'ethers';
import { inMemoryChainHistory } from '../../../../test/support/chain-sync-fakes.js';
import { InMemoryIdentityStore, recordingAudit } from '../../../../test/support/identity-fakes.js';
import { InMemoryOrganizations } from '../../../../test/support/organization-fakes.js';
import {
  FakeProductChain,
  InMemoryProducts,
  onchainProduct,
  SequenceCodes,
  TEST_PRODUCT_PASSPORT,
} from '../../../../test/support/product-fakes.js';
import { TEST_REGISTRAR_KEY, TestClock } from '../../../../test/support/test-config.js';
import {
  TransactionScope,
  type UnitOfWork,
} from '../../../common/persistence/transaction-scope.js';
import { IdentityDirectory } from '../../identity/application/identity-directory.service.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import { OrganizationDirectory } from '../../organizations/application/organization-directory.service.js';
import {
  DuplicateSerialInBatchError,
  ManufacturerRequiredError,
  ProductAlreadyOnChainError,
  ProductChainNotConfiguredError,
  ProductWalletRequiredError,
  SerialTakenError,
} from '../domain/products.errors.js';
import { DeleteProductDraft } from './delete-product-draft.use-case.js';
import { ManufacturerAccess } from './organization-access.service.js';
import { PartyLabels } from './party-labels.js';
import { ProductAuthorizer } from './product-authorizer.service.js';
import { GetMyProduct, ListMyProducts } from './product-queries.js';
import { ProductViews } from './product-views.js';
import { RegisterProducts } from './register-products.use-case.js';
import { RetryProductRegistration } from './retry-product-registration.use-case.js';

const WALLET = '0x1111111111111111111111111111111111111111';
const client = { ipAddress: '127.0.0.1', userAgent: 'vitest' };
const passthrough: UnitOfWork = { run: (work) => work(new TransactionScope({})) };

const LAPTOP: ProductInput = {
  serialNumber: '  abc-2026-000128 ',
  modelName: '  Laptop   ABC Pro 14 ',
  description: '',
  manufacturedOn: '2026-10-01',
  warrantyMonths: 24,
};

async function setup(options: { codes?: string[] } = {}) {
  const store = new InMemoryIdentityStore();
  const organizations = new InMemoryOrganizations();
  const products = new InMemoryProducts();
  const chain = new FakeProductChain();
  const { audit, writer } = recordingAudit();
  const identity = new IdentityDirectory(store, store);
  const directory = new OrganizationDirectory(organizations);
  const access = new ManufacturerAccess(directory, identity);
  const authorizer = new ProductAuthorizer(chain, new TestClock());
  const views = new ProductViews(
    chain,
    products,
    new TestClock(),
    inMemoryChainHistory(undefined, [TEST_PRODUCT_PASSPORT]),
    new PartyLabels(directory),
  );

  async function representative(
    email: string,
    orgType: 'MANUFACTURER' | 'RETAILER',
    authStatus: 'AUTHORIZED' | 'PENDING',
    wallet: string | null = WALLET,
  ): Promise<{ user: AuthenticatedUser; organizationId: string }> {
    const { account } = await store.createWithParty({ email, passwordHash: 'x', fullName: email });
    if (wallet) {
      store.seedWallet(account.id, wallet, 'ACTIVE');
    }
    const organization = await organizations.createDraft({
      representativeUserId: account.id,
      name: `Doanh nghiệp ${email}`,
      taxCode: String(3_100_000_000 + organizations.rows.size),
      orgType,
      contactEmail: email,
      contactPhone: null,
      address: null,
      profileHash: '0x' + 'aa'.repeat(32),
    });
    if (authStatus === 'AUTHORIZED') {
      await organizations.applyStatus(organization.id, { status: 'AUTHORIZED', at: new Date() });
    }
    return {
      user: { id: account.id, email, fullName: email, systemRole: 'USER' },
      organizationId: organization.id,
    };
  }

  const maker = await representative('dai.dien@abc.vn', 'MANUFACTURER', 'AUTHORIZED');
  return {
    store,
    organizations,
    products,
    chain,
    writer,
    representative,
    maker,
    register: new RegisterProducts(
      products,
      chain,
      new SequenceCodes(options.codes),
      passthrough,
      access,
      authorizer,
      audit,
    ),
    retry: new RetryProductRegistration(products, chain, access, authorizer, audit),
    remove: new DeleteProductDraft(products, chain, access, audit),
    list: new ListMyProducts(products, chain, access, views),
    detail: new GetMyProduct(products, access, views),
  };
}

describe('PRD-01, PRD-02 Đăng ký sản phẩm', () => {
  it('lưu bản nháp đã chuẩn hoá kèm mã QR và cấp giấy phép do khoá registrar ký', async () => {
    const { register, products, chain, writer, maker } = await setup();

    const authorization = await register.execute(maker.user, [LAPTOP], client);

    const issuer = partyIdFromUuid(maker.organizationId);
    const draft = products.only();
    expect(draft).toMatchObject({
      serialNumber: 'ABC-2026-000128',
      modelName: 'Laptop ABC Pro 14',
      description: null,
      issuerOrgId: maker.organizationId,
      syncStatus: 'PENDING',
      productState: null,
      chainProductId: productIdOf(issuer, 'ABC-2026-000128'),
    });
    expect(draft.publicCode).toMatch(PUBLIC_CODE_PATTERN);
    expect(draft.metadataHash).toBe(
      productMetadataHash({
        issuerPartyId: issuer,
        serialNumber: 'ABC-2026-000128',
        modelName: 'Laptop ABC Pro 14',
        description: null,
        manufacturedOn: '2026-10-01',
        warrantyMonths: 24,
      }),
    );
    expect(authorization).toMatchObject({
      method: 'registerProducts',
      issuerId: issuer,
      productIds: [draft.chainProductId],
      metadataHashes: [draft.metadataHash],
      wallet: '0x1111111111111111111111111111111111111111',
      products: [{ id: draft.id, serialNumber: draft.serialNumber, publicCode: draft.publicCode }],
    });
    const signer = verifyTypedData(
      productPassportDomain(chain.chainId, authorization.contractAddress),
      PRODUCT_REGISTRATION_TYPES,
      { ...chain.signed[0] },
      authorization.signature,
    );
    expect(signer).toBe(new Wallet(TEST_REGISTRAR_KEY).address);
    expect(writer.actions()).toEqual(['PRODUCT_REGISTRATION_AUTHORIZED']);
  });

  it('một lô CSV thành nhiều bản nháp, giữ đúng thứ tự trong giấy phép', async () => {
    const { register, products, maker } = await setup();
    const batch = Array.from({ length: 3 }, (_, index) => ({
      ...LAPTOP,
      serialNumber: `LOT-${index + 1}`,
    }));

    const authorization = await register.execute(maker.user, batch, client);

    expect(authorization.products.map((product) => product.serialNumber)).toEqual([
      'LOT-1',
      'LOT-2',
      'LOT-3',
    ]);
    expect(authorization.productIds).toEqual(products.rows.map((row) => row.chainProductId));
    expect(new Set(products.rows.map((row) => row.publicCode)).size).toBe(3);
  });

  it('chỉ người đại diện nhà sản xuất đã duyệt và đã liên kết ví mới đăng ký được', async () => {
    const { register, representative } = await setup();
    const pending = await representative('cho.duyet@xyz.vn', 'MANUFACTURER', 'PENDING');
    const retailer = await representative('cua.hang@xyz.vn', 'RETAILER', 'AUTHORIZED');
    const noWallet = await representative('chua.vi@xyz.vn', 'MANUFACTURER', 'AUTHORIZED', null);

    await expect(register.execute(pending.user, [LAPTOP], client)).rejects.toBeInstanceOf(
      ManufacturerRequiredError,
    );
    await expect(register.execute(retailer.user, [LAPTOP], client)).rejects.toBeInstanceOf(
      ManufacturerRequiredError,
    );
    await expect(register.execute(noWallet.user, [LAPTOP], client)).rejects.toBeInstanceOf(
      ProductWalletRequiredError,
    );
  });

  it('serial lặp trong lô hoặc đã có (không phân biệt hoa thường) thì báo đúng serial', async () => {
    const { register, maker } = await setup();
    await register.execute(maker.user, [LAPTOP], client);

    await expect(
      register.execute(
        maker.user,
        [
          { ...LAPTOP, serialNumber: 'NEW-1' },
          { ...LAPTOP, serialNumber: 'new-1' },
        ],
        client,
      ),
    ).rejects.toMatchObject(new DuplicateSerialInBatchError(['NEW-1']));
    await expect(
      register.execute(maker.user, [{ ...LAPTOP, serialNumber: 'ABC-2026-000128' }], client),
    ).rejects.toMatchObject(new SerialTakenError(['ABC-2026-000128']));
  });

  it('nhà sản xuất khác được dùng trùng serial: productId vẫn khác nhau', async () => {
    const { register, representative, products, maker } = await setup();
    const other = await representative(
      'xyz@xyz.vn',
      'MANUFACTURER',
      'AUTHORIZED',
      '0x' + '33'.repeat(20),
    );

    await register.execute(maker.user, [LAPTOP], client);
    await register.execute(other.user, [LAPTOP], client);

    const [first, second] = products.rows;
    expect(first?.serialNumber).toBe(second?.serialNumber);
    expect(first?.chainProductId).not.toBe(second?.chainProductId);
  });

  it('mã QR sinh ra trùng mã đã có thì sinh lại mã khác', async () => {
    const { register, products, maker } = await setup({
      codes: ['K7M2PQ9XRT4W', 'K7M2PQ9XRT4W', 'H3JK5LMN6PQR'],
    });
    await register.execute(maker.user, [LAPTOP], client);

    await register.execute(maker.user, [{ ...LAPTOP, serialNumber: 'ABC-2' }], client);

    expect(products.rows.map((row) => row.publicCode)).toEqual(['K7M2PQ9XRT4W', 'H3JK5LMN6PQR']);
  });

  it('chưa cấu hình ProductPassport thì báo rõ, không lưu gì', async () => {
    const { register, chain, products, maker } = await setup();
    chain.contractAddress = null;

    await expect(register.execute(maker.user, [LAPTOP], client)).rejects.toBeInstanceOf(
      ProductChainNotConfiguredError,
    );
    expect(products.rows).toHaveLength(0);
  });
});

describe('Bản nháp chưa ghi lên blockchain', () => {
  it('gửi lại thì ký giấy phép mới cho đúng hồ sơ cũ, không tạo bản nháp mới', async () => {
    const { register, retry, products, maker } = await setup();
    const first = await register.execute(maker.user, [LAPTOP], client);

    const again = await retry.execute(maker.user, [products.only().id], client);

    expect(products.rows).toHaveLength(1);
    expect(again.productIds).toEqual(first.productIds);
    expect(again.metadataHashes).toEqual(first.metadataHashes);
  });

  it('giao dịch trước đã lên chain (Indexer chưa kịp chốt) thì không gửi lại, không xoá được', async () => {
    const { register, retry, remove, products, chain, maker } = await setup();
    await register.execute(maker.user, [LAPTOP], client);
    const draft = products.only();
    chain.onchain.set(
      draft.chainProductId,
      onchainProduct(partyIdFromUuid(maker.organizationId), draft.metadataHash),
    );

    await expect(retry.execute(maker.user, [draft.id], client)).rejects.toBeInstanceOf(
      ProductAlreadyOnChainError,
    );
    await expect(remove.execute(maker.user, draft.id, client)).rejects.toBeInstanceOf(
      ProductAlreadyOnChainError,
    );
    expect(products.rows).toHaveLength(1);
  });

  it('xoá được bản nháp nhập nhầm; danh sách đếm đúng bản nháp và đã đăng ký', async () => {
    const { register, remove, list, products, maker } = await setup();
    await register.execute(maker.user, [LAPTOP, { ...LAPTOP, serialNumber: 'ABC-2' }], client);
    await products.markRegistered(products.rows[0]?.id ?? '', {
      issuerPartyId: maker.organizationId,
      txHash: '0x' + '01'.repeat(32),
      at: new Date(),
    });

    await remove.execute(maker.user, products.rows[1]?.id ?? '', client);

    const view = await list.execute(maker.user, {
      filter: 'ALL',
      search: null,
      page: 1,
      pageSize: 20,
    });
    expect(view.counts).toEqual({ ALL: 1, REGISTERED: 1, DRAFT: 0 });
    expect(view.manufacturer?.partyId).toBe(partyIdFromUuid(maker.organizationId));
  });

  it('chi tiết sản phẩm đã đăng ký: hash hồ sơ khớp và đọc lại đúng trên chain', async () => {
    const { register, detail, products, chain, maker } = await setup();
    await register.execute(maker.user, [LAPTOP], client);
    const draft = products.only();
    await products.markRegistered(draft.id, {
      issuerPartyId: maker.organizationId,
      txHash: '0x' + '02'.repeat(32),
      at: new Date(),
    });
    chain.onchain.set(
      draft.chainProductId,
      onchainProduct(partyIdFromUuid(maker.organizationId), draft.metadataHash),
    );

    const view = await detail.execute(maker.user, draft.id);

    expect(view.proof).toMatchObject({
      metadataMatchesHash: true,
      onchainMatches: true,
      registrationTxHash: '0x' + '02'.repeat(32),
    });

    chain.failing = true;
    expect((await detail.execute(maker.user, draft.id)).proof?.onchainMatches).toBeNull();
  });
});
