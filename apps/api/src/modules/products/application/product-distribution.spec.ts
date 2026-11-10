import {
  PRODUCT_SALE_TYPES,
  PUBLIC_CODE_ALPHABET,
  partyIdFromUuid,
  productIdOf,
  productPassportDomain,
} from '@dpp/shared';
import { verifyTypedData, Wallet } from 'ethers';
import { inMemoryChainHistory } from '../../../../test/support/chain-sync-fakes.js';
import { InMemoryIdentityStore, recordingAudit } from '../../../../test/support/identity-fakes.js';
import { InMemoryOrganizations } from '../../../../test/support/organization-fakes.js';
import {
  FakeProductChain,
  InMemoryProducts,
  TEST_PRODUCT_PASSPORT,
} from '../../../../test/support/product-fakes.js';
import { TEST_REGISTRAR_KEY, TestClock } from '../../../../test/support/test-config.js';
import { IdentityDirectory } from '../../identity/application/identity-directory.service.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import { OrganizationDirectory } from '../../organizations/application/organization-directory.service.js';
import { OwnerParties } from './owner-parties.service.js';
import {
  BuyerNotFoundError,
  ManufacturerRequiredError,
  ProductNotInStockError,
  RetailerRequiredError,
} from '../domain/products.errors.js';
import { ListMyInventory } from './inventory-queries.js';
import { ManufacturerAccess, RetailerAccess } from './organization-access.service.js';
import { GetWorkspace, ListOwnedProducts } from './owned-product-queries.js';
import { PartyLabels } from './party-labels.js';
import { maskEmail, PrepareProductSale } from './prepare-product-sale.use-case.js';
import { GetPublicPassport, ListRetailers } from './product-queries.js';
import { ProductViews } from './product-views.js';

const client = { ipAddress: '127.0.0.1', userAgent: 'vitest' };
const WALLET = '0x2222222222222222222222222222222222222222';

async function setup() {
  const store = new InMemoryIdentityStore();
  const organizations = new InMemoryOrganizations();
  const products = new InMemoryProducts();
  const chain = new FakeProductChain();
  const clock = new TestClock(new Date('2026-11-02T03:00:00Z'));
  const { audit, writer } = recordingAudit();
  const identity = new IdentityDirectory(store, store);
  const directory = new OrganizationDirectory(organizations);
  const views = new ProductViews(
    chain,
    products,
    clock,
    inMemoryChainHistory(undefined, [TEST_PRODUCT_PASSPORT]),
    new PartyLabels(directory),
  );
  const retailerAccess = new RetailerAccess(directory, identity);

  async function account(email: string): Promise<AuthenticatedUser> {
    const { account: created } = await store.createWithParty({
      email,
      passwordHash: 'x',
      fullName: `Chị ${email.split('@')[0]}`,
    });
    return { id: created.id, email, fullName: created.fullName, systemRole: 'USER' };
  }

  async function organization(
    user: AuthenticatedUser,
    name: string,
    orgType: 'MANUFACTURER' | 'RETAILER',
    authorized = true,
  ): Promise<string> {
    store.seedWallet(user.id, WALLET.replace('22', String(10 + organizations.rows.size)), 'ACTIVE');
    const created = await organizations.createDraft({
      representativeUserId: user.id,
      name,
      taxCode: String(3_100_000_000 + organizations.rows.size),
      orgType,
      contactEmail: user.email,
      contactPhone: null,
      address: `${organizations.rows.size + 1} Lê Lợi, Quận 1, TP. Hồ Chí Minh`,
      profileHash: '0x' + 'aa'.repeat(32),
    });
    await store.createOrganizationParty(created.id);
    if (authorized) {
      await organizations.applyStatus(created.id, { status: 'AUTHORIZED', at: new Date() });
    }
    return created.id;
  }

  const makerUser = await account('daidien@nhasanxuat.vn');
  const shopUser = await account('daidien@cuahang.vn');
  const buyerUser = await account('khach.hang@gmail.com');
  const makerId = await organization(makerUser, 'Công ty Sản xuất An Phát', 'MANUFACTURER');
  const shopId = await organization(shopUser, 'Siêu thị Điện máy Sao Mai', 'RETAILER');

  /** Sản phẩm đã đăng ký và đang ở cửa hàng (như Indexer đã chiếu). */
  async function inStock(serial: string, months = 24) {
    const [draft] = await products.createDrafts([
      {
        serialNumber: serial,
        modelName: 'Máy lọc không khí AP-500',
        description: null,
        manufacturedOn: '2026-10-15',
        warrantyMonths: months,
        issuerOrgId: makerId,
        chainProductId: productIdOf(partyIdFromUuid(makerId), serial),
        publicCode: `KMNPQRSTAAA${PUBLIC_CODE_ALPHABET[products.rows.length] ?? 'Z'}`,
        metadataHash: '0x' + 'ab'.repeat(32),
      },
    ]);
    const id = draft!.id;
    await products.markRegistered(id, {
      issuerPartyId: makerId,
      txHash: '0x' + '01'.repeat(32),
      at: new Date(),
    });
    await products.markDispatched(id, shopId);
    await products.markReceived(id, shopId);
    return products.rows.find((row) => row.id === id)!;
  }

  return {
    store,
    products,
    chain,
    clock,
    writer,
    makerUser,
    shopUser,
    buyerUser,
    makerId,
    shopId,
    account,
    organization,
    inStock,
    prepareSale: new PrepareProductSale(products, chain, clock, retailerAccess, identity, audit),
    inventory: new ListMyInventory(products, chain, retailerAccess, views),
    owned: new ListOwnedProducts(products, new OwnerParties(identity, directory), views),
    workspace: new GetWorkspace(products, new OwnerParties(identity, directory)),
    retailers: new ListRetailers(directory, new ManufacturerAccess(directory, identity)),
    passport: new GetPublicPassport(products, directory, views),
  };
}

describe('DST-03 giấy phép bán', () => {
  it('nhà bán lẻ nhập email người mua: giấy phép ProductSale đúng người mua, registrar ký', async () => {
    const { prepareSale, inStock, shopUser, shopId, store, buyerUser, chain, writer } =
      await setup();
    const product = await inStock('AP500-2610-00001');

    const sale = await prepareSale.execute(shopUser, product.id, ' Khach.Hang@Gmail.com ', client);

    const buyerParty = store.partyOfUser(buyerUser.id).id;
    expect(sale).toMatchObject({
      method: 'sellAndActivateWarranty',
      productId: product.chainProductId,
      retailerId: partyIdFromUuid(shopId),
      buyerId: partyIdFromUuid(buyerParty),
      buyer: { fullName: 'Chị khach.hang', maskedEmail: 'k***@gmail.com' },
      warrantyMonths: 24,
    });
    const signer = verifyTypedData(
      productPassportDomain(chain.chainId, TEST_PRODUCT_PASSPORT),
      PRODUCT_SALE_TYPES,
      { ...chain.sales[0], deadline: BigInt(sale.deadline) },
      sale.signature,
    );
    expect(signer).toBe(new Wallet(TEST_REGISTRAR_KEY).address);
    expect(BigInt(sale.deadline)).toBe(BigInt(Date.parse('2026-11-02T03:15:00Z') / 1000));
    expect(writer.actions()).toEqual(['PRODUCT_SALE_AUTHORIZED']);
  });

  it('email chưa có tài khoản, hàng chưa về cửa hàng hoặc không phải nhà bán lẻ thì từ chối', async () => {
    const { prepareSale, inStock, products, shopUser, makerUser } = await setup();
    const product = await inStock('AP500-2610-00002');

    await expect(
      prepareSale.execute(shopUser, product.id, 'chua.co@gmail.com', client),
    ).rejects.toBeInstanceOf(BuyerNotFoundError);
    await expect(
      prepareSale.execute(makerUser, product.id, 'khach.hang@gmail.com', client),
    ).rejects.toBeInstanceOf(RetailerRequiredError);

    await products.markSold(product.id, product.issuerOrgId);
    await products.recordCustody({
      productId: product.id,
      fromPartyId: product.currentCustodianPartyId,
      toPartyId: product.issuerOrgId,
      eventId: 'e-da-ban',
      at: new Date(),
    });
    await expect(
      prepareSale.execute(shopUser, product.id, 'khach.hang@gmail.com', client),
    ).rejects.toBeInstanceOf(ProductNotInStockError);
  });

  it('che email: chỉ giữ ký tự đầu và tên miền', () => {
    expect(maskEmail('nguyen.van.a@gmail.com')).toBe('n***@gmail.com');
  });
});

describe('Kho hàng, sản phẩm của người mua, hộ chiếu công khai', () => {
  it('kho nhà bán lẻ đếm chờ nhận, đang bán, đã bán và hiện tên nhà sản xuất', async () => {
    const { inventory, inStock, products, shopUser, shopId, store, buyerUser } = await setup();
    const sold = await inStock('AP500-2610-00003');
    await inStock('AP500-2610-00004');
    const buyerParty = store.partyOfUser(buyerUser.id).id;
    await products.markSold(sold.id, buyerParty);
    await products.setCustodian(sold.id, buyerParty);
    await products.recordCustody({
      productId: sold.id,
      fromPartyId: shopId,
      toPartyId: buyerParty,
      eventId: 'e-sale',
      at: new Date('2026-11-01T02:00:00Z'),
    });

    const stock = await inventory.execute(shopUser, { filter: 'IN_STOCK', page: 1, pageSize: 20 });
    const history = await inventory.execute(shopUser, { filter: 'SOLD', page: 1, pageSize: 20 });

    expect(stock.counts).toEqual({ INCOMING: 0, IN_STOCK: 1, SOLD: 1 });
    expect(stock.items[0]?.issuer.name).toBe('Công ty Sản xuất An Phát');
    expect(stock.items[0]?.holder).toMatchObject({
      kind: 'ORGANIZATION',
      organization: { name: 'Siêu thị Điện máy Sao Mai' },
    });
    expect(history.items[0]).toMatchObject({
      serialNumber: 'AP500-2610-00003',
      soldAt: '2026-11-01T02:00:00.000Z',
      holder: { kind: 'PERSON', isYou: false },
    });
  });

  it('người mua thấy sản phẩm của mình kèm bảo hành; trang công khai không lộ người mua', async () => {
    const { owned, passport, workspace, inStock, products, store, buyerUser, shopId, clock } =
      await setup();
    const product = await inStock('AP500-2610-00005', 12);
    const buyerParty = store.partyOfUser(buyerUser.id).id;
    await products.markSold(product.id, buyerParty);
    await products.setCustodian(product.id, buyerParty);
    await products.activateWarranty({
      productId: product.id,
      activatedByPartyId: shopId,
      activatedAt: new Date('2026-11-01T02:00:00Z'),
      expiresAt: new Date('2027-11-01T02:00:00Z'),
      warrantyState: 'ACTIVE',
      activationTxHash: '0x' + '05'.repeat(32),
    });

    const [mine] = await owned.execute(buyerUser);
    expect(mine).toMatchObject({
      serialNumber: 'AP500-2610-00005',
      holder: { kind: 'PERSON', isYou: true },
      issuer: { name: 'Công ty Sản xuất An Phát' },
      warranty: {
        state: 'ACTIVE',
        months: 12,
        expiresAt: '2027-11-01T02:00:00.000Z',
        activatedBy: { name: 'Siêu thị Điện máy Sao Mai' },
      },
    });
    expect(await workspace.execute(buyerUser)).toEqual({ organization: null, ownedProducts: 1 });

    const view = await passport.execute(product.publicCode);
    expect(view).toMatchObject({
      productState: 'SOLD',
      hasOwner: true,
      holder: { kind: 'PERSON', isYou: false },
      warranty: { state: 'ACTIVE' },
    });
    expect(JSON.stringify(view)).not.toContain(buyerUser.email);

    clock.advance(366 * 24 * 3600 * 1000);
    expect((await passport.execute(product.publicCode)).warranty?.state).toBe('EXPIRED');
  });

  it('nhà sản xuất chọn nhà bán lẻ đã duyệt; tổ chức khác loại hoặc chưa duyệt không có trong danh sách', async () => {
    const { retailers, makerUser, shopUser, account, organization } = await setup();
    await organization(
      await account('cho.duyet@cuahang.vn'),
      'Cửa hàng chờ duyệt',
      'RETAILER',
      false,
    );

    const options = await retailers.execute(makerUser);

    expect(options.map((option) => option.name)).toEqual(['Siêu thị Điện máy Sao Mai']);
    expect(options[0]?.address).toContain('Lê Lợi');
    await expect(retailers.execute(shopUser)).rejects.toBeInstanceOf(ManufacturerRequiredError);
  });
});
