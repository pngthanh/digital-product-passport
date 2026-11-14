import {
  LIFECYCLE_CONTRACT_ROLE,
  lifecycleDomain,
  MANUFACTURER_ROLE,
  partyIdFromUuid,
  productIdOf,
  RECALL_AUTHORIZATION_TYPES,
  type RecallAuthorization,
  recallAuthorizationDigest,
  recallReasonHash,
  TRANSFER_AUTHORIZATION_TYPES,
  TRANSFER_CONTRACT_ROLE,
  transferDomain,
} from '@dpp/shared';
import { expect } from 'chai';
import { type BaseWallet, id, type Signer, Wallet, ZeroAddress, ZeroHash } from 'ethers';
import { network } from 'hardhat';
import {
  CAROL_PARTY,
  MAKER,
  OTHER_SHOP,
  passportFixture,
  SHOP,
  STATE,
} from '../support/passport-fixture.js';

const connection = await network.create();
const { ethers, networkHelpers } = connection;
const deployPassport = passportFixture(connection);

const DAVE_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000004');
const OTHER_MAKER = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000a7');
const REASON = recallReasonHash('Pin có nguy cơ phồng khi sạc nhanh, ngừng sử dụng ngay.');

/**
 * Fixture M6 cộng thêm: ProductLifecycle có LIFECYCLE_CONTRACT_ROLE; Dave đại diện một nhà sản xuất
 * khác (OTHER_MAKER); ServiceTicketsStub giả lập phiếu sửa đang mở.
 */
async function deployLifecycle() {
  const fixture = await deployPassport();
  const { registry, passport, admin, alice, bob, dave, registrar } = fixture;
  await fixture.registerUser(dave, DAVE_PARTY);
  await fixture.organization(dave, DAVE_PARTY, OTHER_MAKER, MANUFACTURER_ROLE, true);
  const tickets = await ethers.deployContract('ServiceTicketsStub');
  const lifecycle = await ethers.deployContract('ProductLifecycle', [
    await registry.getAddress(),
    await passport.getAddress(),
    await tickets.getAddress(),
  ]);
  await registry.connect(admin).grantRole(LIFECYCLE_CONTRACT_ROLE, await lifecycle.getAddress());
  const domain = lifecycleDomain(fixture.chainId, await lifecycle.getAddress());

  /** Sản phẩm đã bán cho Carol. */
  async function owned(serial: string): Promise<string> {
    const productId = await fixture.atRetail(serial);
    await fixture.sell(bob, await fixture.authorizeSale({ productId, buyerId: CAROL_PARTY }));
    return productId;
  }

  /** Sản phẩm của Alice (MAKER) ở bốn trạng thái còn thu hồi được. */
  async function everyStage() {
    const created = await fixture.registerOne('ABC-2026-000001');
    const shipping = await fixture.registerOne('ABC-2026-000002');
    await passport.connect(alice).dispatchCustody(shipping, SHOP);
    const atShop = await fixture.atRetail('ABC-2026-000003');
    const sold = await owned('ABC-2026-000004');
    return { created, shipping, atShop, sold };
  }

  async function authorize(
    overrides: Partial<RecallAuthorization> & Pick<RecallAuthorization, 'productIds'>,
    signer: BaseWallet = registrar,
  ): Promise<RecallAuthorization & { signature: string }> {
    const authorization: RecallAuthorization = {
      issuerId: MAKER,
      reasonHash: REASON,
      deadline: await fixture.deadline(),
      ...overrides,
    };
    const signature = await signer.signTypedData(domain, RECALL_AUTHORIZATION_TYPES, authorization);
    return { ...authorization, signature };
  }

  function recall(wallet: Signer, permit: RecallAuthorization & { signature: string }) {
    return lifecycle
      .connect(wallet)
      .recallProducts(permit.productIds, permit.reasonHash, permit.deadline, permit.signature);
  }

  return { ...fixture, tickets, lifecycle, owned, everyStage, authorize, recall };
}

describe('ProductLifecycle – thu hồi, báo mất, ngừng sử dụng (RCL-01, LIF-01, LIF-02)', () => {
  it('RCL-01: thu hồi một lô ở mọi giai đoạn; hàng đang giao tự huỷ bàn giao, lưu hash lý do', async () => {
    const { lifecycle, passport, alice, everyStage, authorize, recall } =
      await networkHelpers.loadFixture(deployLifecycle);
    const { created, shipping, atShop, sold } = await everyStage();
    const productIds = [created, shipping, atShop, sold];

    const tx = recall(alice, await authorize({ productIds }));
    for (const productId of productIds) {
      await expect(tx)
        .to.emit(lifecycle, 'ProductRecalled')
        .withArgs(productId, MAKER, REASON)
        .and.to.emit(passport, 'ProductStateChanged');
    }
    await expect(tx).to.emit(passport, 'CustodyHandoverCancelled').withArgs(shipping, MAKER, SHOP);

    for (const productId of productIds) {
      expect((await passport.product(productId)).state).to.equal(STATE.RECALLED);
      expect(await lifecycle.recallReasonOf(productId)).to.equal(REASON);
    }
    expect((await passport.product(shipping)).pendingCustodianId).to.equal(ZeroHash);
    expect((await passport.product(sold)).ownerId).to.equal(CAROL_PARTY);
  });

  it('ProductRecalled phát trước ProductStateChanged để bên đọc thấy bên giữ hàng lúc thu hồi', async () => {
    const { lifecycle, passport, alice, atRetail, authorize, recall } =
      await networkHelpers.loadFixture(deployLifecycle);
    const productId = await atRetail('ABC-2026-000001');
    const receipt = await (
      await recall(alice, await authorize({ productIds: [productId] }))
    ).wait();
    const names = (receipt?.logs ?? []).map(
      (log) =>
        lifecycle.interface.parseLog(log)?.name ?? passport.interface.parseLog(log)?.name ?? null,
    );
    expect(names).to.deep.equal(['ProductRecalled', 'ProductStateChanged']);
  });

  it('chỉ nhà sản xuất phát hành thu hồi được', async () => {
    const { lifecycle, bob, dave, alice, atRetail, authorize, recall } =
      await networkHelpers.loadFixture(deployLifecycle);
    const productId = await atRetail('ABC-2026-000001');
    await expect(recall(bob, await authorize({ productIds: [productId] })))
      .to.be.revertedWithCustomError(lifecycle, 'NotAuthorizedManufacturer')
      .withArgs(bob.address);
    await expect(recall(dave, await authorize({ issuerId: OTHER_MAKER, productIds: [productId] })))
      .to.be.revertedWithCustomError(lifecycle, 'NotIssuer')
      .withArgs(productId, OTHER_MAKER);
    const unknown = productIdOf(MAKER, 'KHONG-CO');
    await expect(recall(alice, await authorize({ productIds: [unknown] })))
      .to.be.revertedWithCustomError(lifecycle, 'NotIssuer')
      .withArgs(unknown, MAKER);
  });

  it('lô từ 1 đến 50 sản phẩm, lý do khác 0; giấy phép khoá nhà sản xuất, danh sách và lý do', async () => {
    const { lifecycle, alice, atRetail, authorize, recall } =
      await networkHelpers.loadFixture(deployLifecycle);
    const productId = await atRetail('ABC-2026-000001');
    const other = await atRetail('ABC-2026-000002');
    for (const productIds of [[], Array.from({ length: 51 }, () => productId)]) {
      await expect(recall(alice, await authorize({ productIds })))
        .to.be.revertedWithCustomError(lifecycle, 'InvalidBatchSize')
        .withArgs(productIds.length);
    }
    await expect(
      recall(alice, await authorize({ productIds: [productId], reasonHash: ZeroHash })),
    ).to.be.revertedWithCustomError(lifecycle, 'ZeroBytes32');

    const permit = await authorize({ productIds: [productId] });
    await expect(
      recall(alice, { ...permit, productIds: [productId, other] }),
    ).to.be.revertedWithCustomError(lifecycle, 'InvalidAuthorization');
    await expect(
      recall(alice, { ...permit, reasonHash: id('ly do khac') }),
    ).to.be.revertedWithCustomError(lifecycle, 'InvalidAuthorization');
    await expect(
      recall(alice, await authorize({ productIds: [productId] }, Wallet.createRandom())),
    ).to.be.revertedWithCustomError(lifecycle, 'InvalidAuthorization');
    await networkHelpers.time.increaseTo(permit.deadline + 1n);
    await expect(recall(alice, permit))
      .to.be.revertedWithCustomError(lifecycle, 'AuthorizationExpired')
      .withArgs(permit.deadline);
  });

  it('thu hồi là trạng thái cuối: không thu hồi lại, không bán, chủ không báo mất được', async () => {
    const { lifecycle, passport, alice, bob, atRetail, authorize, authorizeSale, sell, recall } =
      await networkHelpers.loadFixture(deployLifecycle);
    const productId = await atRetail('ABC-2026-000001');
    await recall(alice, await authorize({ productIds: [productId] }));

    await expect(recall(alice, await authorize({ productIds: [productId] })))
      .to.be.revertedWithCustomError(lifecycle, 'ProductNotRecallable')
      .withArgs(productId, STATE.RECALLED);
    await expect(
      sell(bob, await authorizeSale({ productId, buyerId: CAROL_PARTY })),
    ).to.be.revertedWithCustomError(passport, 'InvalidStateTransition');
    await expect(lifecycle.connect(bob).reportLostStolen(productId))
      .to.be.revertedWithCustomError(lifecycle, 'ProductNotSold')
      .withArgs(productId, STATE.RECALLED);
  });

  it('LIF-01, LIF-02: chủ sở hữu báo mất hoặc ngừng sử dụng; trạng thái cuối, nhà sản xuất không thu hồi nữa', async () => {
    const { lifecycle, passport, alice, carol, owned, authorize, recall } =
      await networkHelpers.loadFixture(deployLifecycle);
    const lost = await owned('ABC-2026-000001');
    const retired = await owned('ABC-2026-000002');

    await expect(lifecycle.connect(carol).reportLostStolen(lost))
      .to.emit(lifecycle, 'ProductReportedLostStolen')
      .withArgs(lost, CAROL_PARTY)
      .and.to.emit(passport, 'ProductStateChanged')
      .withArgs(lost, STATE.SOLD, STATE.LOST_STOLEN);
    await expect(lifecycle.connect(carol).retireProduct(retired))
      .to.emit(lifecycle, 'ProductRetired')
      .withArgs(retired, CAROL_PARTY)
      .and.to.emit(passport, 'ProductStateChanged')
      .withArgs(retired, STATE.SOLD, STATE.RETIRED);

    await expect(lifecycle.connect(carol).retireProduct(lost))
      .to.be.revertedWithCustomError(lifecycle, 'ProductNotSold')
      .withArgs(lost, STATE.LOST_STOLEN);
    await expect(lifecycle.connect(carol).reportLostStolen(retired))
      .to.be.revertedWithCustomError(lifecycle, 'ProductNotSold')
      .withArgs(retired, STATE.RETIRED);
    await expect(recall(alice, await authorize({ productIds: [lost] })))
      .to.be.revertedWithCustomError(lifecycle, 'ProductNotRecallable')
      .withArgs(lost, STATE.LOST_STOLEN);
  });

  it('chỉ chủ sở hữu, chỉ khi đã bán và không có phiếu sửa đang mở', async () => {
    const { lifecycle, tickets, alice, bob, carol, atRetail, owned } =
      await networkHelpers.loadFixture(deployLifecycle);
    const productId = await owned('ABC-2026-000001');
    for (const wallet of [alice, bob]) {
      await expect(lifecycle.connect(wallet).reportLostStolen(productId))
        .to.be.revertedWithCustomError(lifecycle, 'NotProductOwner')
        .withArgs(productId, wallet.address);
    }
    const unsold = await atRetail('ABC-2026-000002');
    await expect(lifecycle.connect(bob).retireProduct(unsold))
      .to.be.revertedWithCustomError(lifecycle, 'ProductNotSold')
      .withArgs(unsold, STATE.AT_RETAIL);

    const ticket = id('phieu sua');
    await tickets.setOpenTicket(productId, ticket);
    await expect(lifecycle.connect(carol).retireProduct(productId))
      .to.be.revertedWithCustomError(lifecycle, 'ProductUnderRepair')
      .withArgs(productId, ticket);
    await tickets.setOpenTicket(productId, ZeroHash);
    await expect(lifecycle.connect(carol).retireProduct(productId)).to.emit(
      lifecycle,
      'ProductRetired',
    );
  });

  it('tổ chức đang sở hữu (nhận qua chuyển nhượng): người đại diện báo mất được', async () => {
    const {
      lifecycle,
      registry,
      passport,
      admin,
      carol,
      erin,
      tickets,
      registrar,
      chainId,
      owned,
    } = await networkHelpers.loadFixture(deployLifecycle);
    const transfers = await ethers.deployContract('OwnershipTransfer', [
      await registry.getAddress(),
      await passport.getAddress(),
      await tickets.getAddress(),
    ]);
    await registry.connect(admin).grantRole(TRANSFER_CONTRACT_ROLE, await transfers.getAddress());
    const productId = await owned('ABC-2026-000001');
    const latest = BigInt(await networkHelpers.time.latest());
    const permit = {
      productId,
      fromPartyId: CAROL_PARTY,
      toPartyId: OTHER_SHOP,
      expiresAt: latest + 86_400n,
      deadline: latest + 900n,
    };
    const signature = await registrar.signTypedData(
      transferDomain(chainId, await transfers.getAddress()),
      TRANSFER_AUTHORIZATION_TYPES,
      permit,
    );
    await transfers
      .connect(carol)
      .createTransferRequest(productId, OTHER_SHOP, permit.expiresAt, permit.deadline, signature);
    await transfers.connect(erin).acceptTransfer(1n);

    await expect(lifecycle.connect(carol).reportLostStolen(productId))
      .to.be.revertedWithCustomError(lifecycle, 'NotProductOwner')
      .withArgs(productId, carol.address);
    await expect(lifecycle.connect(erin).reportLostStolen(productId))
      .to.emit(lifecycle, 'ProductReportedLostStolen')
      .withArgs(productId, OTHER_SHOP);
  });

  it('thiếu LIFECYCLE_CONTRACT_ROLE thì ProductPassport từ chối', async () => {
    const { lifecycle, registry, passport, admin, carol, owned } =
      await networkHelpers.loadFixture(deployLifecycle);
    const productId = await owned('ABC-2026-000001');
    await registry.connect(admin).revokeRole(LIFECYCLE_CONTRACT_ROLE, await lifecycle.getAddress());
    await expect(lifecycle.connect(carol).retireProduct(productId))
      .to.be.revertedWithCustomError(passport, 'CallerNotAuthorized')
      .withArgs(await lifecycle.getAddress());
  });

  it('digest khớp @dpp/shared; từ chối địa chỉ 0 khi deploy', async () => {
    const { lifecycle, registry, chainId } = await networkHelpers.loadFixture(deployLifecycle);
    const permit: RecallAuthorization = {
      issuerId: MAKER,
      productIds: [id('san pham 1'), id('san pham 2')],
      reasonHash: REASON,
      deadline: 123n,
    };
    expect(
      await lifecycle.recallAuthorizationDigest(
        permit.issuerId,
        permit.productIds,
        permit.reasonHash,
        permit.deadline,
      ),
    ).to.equal(recallAuthorizationDigest(chainId, await lifecycle.getAddress(), permit));
    await expect(
      ethers.deployContract('ProductLifecycle', [
        await registry.getAddress(),
        ZeroAddress,
        ZeroAddress,
      ]),
    ).to.be.revertedWithCustomError(lifecycle, 'ZeroAddress');
  });
});
