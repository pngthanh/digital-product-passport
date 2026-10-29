import {
  addWarrantyMonths,
  DEFAULT_ADMIN_ROLE,
  LIFECYCLE_CONTRACT_ROLE,
  MANUFACTURER_ROLE,
  partyIdFromUuid,
  productSaleDigest,
  RETAILER_ROLE,
  statusReasonHash,
  TRANSFER_CONTRACT_ROLE,
} from '@dpp/shared';
import { expect } from 'chai';
import { Wallet, ZeroHash } from 'ethers';
import { network } from 'hardhat';
import {
  BUYER_PARTY,
  CAROL_PARTY,
  MAKER,
  OTHER_SHOP,
  passportFixture,
  SHOP,
  STATE,
} from '../support/passport-fixture.js';

const connection = await network.create();
const { ethers, networkHelpers } = connection;
const deployFixture = passportFixture(connection);
const WARRANTY_ACTIVE = 1n;

describe('ProductPassport – DST-01, DST-02 giao hàng 2 bước (D7)', () => {
  it('nhà sản xuất gửi cho nhà bán lẻ đã duyệt: IN_DISTRIBUTION, bên nhận chờ xác nhận', async () => {
    const { passport, registerOne, alice } = await networkHelpers.loadFixture(deployFixture);
    const productId = await registerOne();

    await expect(passport.connect(alice).dispatchCustody(productId, SHOP))
      .to.emit(passport, 'CustodyHandoverInitiated')
      .withArgs(productId, MAKER, SHOP)
      .and.to.emit(passport, 'ProductStateChanged')
      .withArgs(productId, STATE.CREATED, STATE.IN_DISTRIBUTION);

    expect(await passport.stateOf(productId)).to.equal(STATE.IN_DISTRIBUTION);
    expect(await passport.pendingCustodianOf(productId)).to.equal(SHOP);
    expect(await passport.custodianOf(productId)).to.equal(MAKER);
  });

  it('chỉ nhà sản xuất đang giữ hàng mới gửi được, và chỉ gửi cho nhà bán lẻ đã duyệt', async () => {
    const { passport, registerOne, organization, alice, bob, carol } =
      await networkHelpers.loadFixture(deployFixture);
    const productId = await registerOne();
    const otherMaker = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000a5');
    await organization(carol, CAROL_PARTY, otherMaker, MANUFACTURER_ROLE, true);

    await expect(passport.connect(bob).dispatchCustody(productId, SHOP))
      .to.be.revertedWithCustomError(passport, 'NotAuthorizedManufacturer')
      .withArgs(bob.address);
    await expect(passport.connect(carol).dispatchCustody(productId, SHOP))
      .to.be.revertedWithCustomError(passport, 'NotCustodian')
      .withArgs(productId, otherMaker);
    await expect(passport.connect(alice).dispatchCustody(productId, MAKER))
      .to.be.revertedWithCustomError(passport, 'RecipientNotRetailer')
      .withArgs(MAKER);
    await expect(passport.connect(alice).dispatchCustody(ZeroHash, SHOP))
      .to.be.revertedWithCustomError(passport, 'ProductNotFound')
      .withArgs(ZeroHash);

    await passport.connect(alice).dispatchCustody(productId, SHOP);
    await expect(passport.connect(alice).dispatchCustody(productId, OTHER_SHOP))
      .to.be.revertedWithCustomError(passport, 'InvalidStateTransition')
      .withArgs(STATE.IN_DISTRIBUTION, STATE.IN_DISTRIBUTION);
  });

  it('nhà bán lẻ được giao xác nhận: AT_RETAIL, nhà bán lẻ thành bên giữ hàng', async () => {
    const { passport, registerOne, alice, bob, erin } =
      await networkHelpers.loadFixture(deployFixture);
    const productId = await registerOne();
    await passport.connect(alice).dispatchCustody(productId, SHOP);

    await expect(passport.connect(erin).confirmCustodyReceipt(productId))
      .to.be.revertedWithCustomError(passport, 'NotPendingCustodian')
      .withArgs(productId, OTHER_SHOP);
    await expect(passport.connect(alice).confirmCustodyReceipt(productId))
      .to.be.revertedWithCustomError(passport, 'NotAuthorizedRetailer')
      .withArgs(alice.address);

    await expect(passport.connect(bob).confirmCustodyReceipt(productId))
      .to.emit(passport, 'CustodyTransferred')
      .withArgs(productId, MAKER, SHOP)
      .and.to.emit(passport, 'ProductStateChanged')
      .withArgs(productId, STATE.IN_DISTRIBUTION, STATE.AT_RETAIL);
    expect(await passport.custodianOf(productId)).to.equal(SHOP);
    expect(await passport.pendingCustodianOf(productId)).to.equal(ZeroHash);
    expect(await passport.ownerOf(productId)).to.equal(ZeroHash);
  });

  it('gửi nhầm: nhà sản xuất huỷ khi chưa nhận, hàng về lại CREATED và gửi lại được', async () => {
    const { passport, registerOne, alice, bob } = await networkHelpers.loadFixture(deployFixture);
    const productId = await registerOne();
    await passport.connect(alice).dispatchCustody(productId, SHOP);

    await expect(passport.connect(bob).cancelDispatch(productId)).to.be.revertedWithCustomError(
      passport,
      'NotAuthorizedManufacturer',
    );
    await expect(passport.connect(alice).cancelDispatch(productId))
      .to.emit(passport, 'CustodyHandoverCancelled')
      .withArgs(productId, MAKER, SHOP)
      .and.to.emit(passport, 'ProductStateChanged')
      .withArgs(productId, STATE.IN_DISTRIBUTION, STATE.CREATED);
    expect(await passport.pendingCustodianOf(productId)).to.equal(ZeroHash);
    await expect(passport.connect(alice).cancelDispatch(productId))
      .to.be.revertedWithCustomError(passport, 'InvalidStateTransition')
      .withArgs(STATE.CREATED, STATE.CREATED);
    await expect(passport.connect(bob).confirmCustodyReceipt(productId))
      .to.be.revertedWithCustomError(passport, 'InvalidStateTransition')
      .withArgs(STATE.CREATED, STATE.AT_RETAIL);

    await expect(passport.connect(alice).dispatchCustody(productId, OTHER_SHOP)).to.emit(
      passport,
      'CustodyHandoverInitiated',
    );
  });

  it('nhà bán lẻ từ chối nhận: hàng về lại nhà sản xuất, nhà bán lẻ khác nhận được', async () => {
    const { passport, registerOne, alice, bob, erin } =
      await networkHelpers.loadFixture(deployFixture);
    const productId = await registerOne();
    await passport.connect(alice).dispatchCustody(productId, SHOP);

    await expect(passport.connect(erin).rejectCustodyReceipt(productId))
      .to.be.revertedWithCustomError(passport, 'NotPendingCustodian')
      .withArgs(productId, OTHER_SHOP);
    await expect(passport.connect(bob).rejectCustodyReceipt(productId))
      .to.emit(passport, 'CustodyHandoverRejected')
      .withArgs(productId, MAKER, SHOP)
      .and.to.emit(passport, 'ProductStateChanged')
      .withArgs(productId, STATE.IN_DISTRIBUTION, STATE.CREATED);
    expect(await passport.custodianOf(productId)).to.equal(MAKER);

    await passport.connect(alice).dispatchCustody(productId, OTHER_SHOP);
    await passport.connect(erin).confirmCustodyReceipt(productId);
    expect(await passport.custodianOf(productId)).to.equal(OTHER_SHOP);
  });

  it('nhà bán lẻ bị khoá sau khi được gửi thì không nhận được; nhà sản xuất vẫn huỷ được', async () => {
    const { passport, registry, registerOne, admin, alice, bob } =
      await networkHelpers.loadFixture(deployFixture);
    const productId = await registerOne();
    await passport.connect(alice).dispatchCustody(productId, SHOP);
    await registry.connect(admin).disableOrganization(SHOP, statusReasonHash('Vi phạm'));

    await expect(passport.connect(bob).confirmCustodyReceipt(productId))
      .to.be.revertedWithCustomError(passport, 'NotAuthorizedRetailer')
      .withArgs(bob.address);
    await expect(passport.connect(alice).cancelDispatch(productId)).to.emit(
      passport,
      'CustodyHandoverCancelled',
    );
  });

  it('đơn nhà bán lẻ chưa được duyệt thì không là bên nhận hợp lệ', async () => {
    const { passport, registerOne, organization, alice, carol } =
      await networkHelpers.loadFixture(deployFixture);
    const productId = await registerOne();
    const pendingShop = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000a6');
    await organization(carol, CAROL_PARTY, pendingShop, RETAILER_ROLE, false);

    await expect(passport.connect(alice).dispatchCustody(productId, pendingShop))
      .to.be.revertedWithCustomError(passport, 'RecipientNotRetailer')
      .withArgs(pendingShop);
  });
});

describe('ProductPassport – DST-03 bán và kích hoạt bảo hành', () => {
  it('bán cho tài khoản chưa liên kết ví: người mua là chủ và giữ hàng, bảo hành 24 tháng', async () => {
    const { passport, warranty, atRetail, authorizeSale, sell, bob } =
      await networkHelpers.loadFixture(deployFixture);
    const productId = await atRetail('ABC-2026-000001', 24);
    const sale = await authorizeSale({ productId });

    const transaction = await sell(bob, sale);
    const receipt = await transaction.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    const soldAt = new Date(block!.timestamp * 1000);
    const expiresAt = BigInt(addWarrantyMonths(soldAt, 24).getTime() / 1000);

    await expect(transaction)
      .to.emit(passport, 'OwnershipTransferred')
      .withArgs(productId, ZeroHash, BUYER_PARTY)
      .and.to.emit(passport, 'CustodyTransferred')
      .withArgs(productId, SHOP, BUYER_PARTY)
      .and.to.emit(passport, 'ProductStateChanged')
      .withArgs(productId, STATE.AT_RETAIL, STATE.SOLD)
      .and.to.emit(warranty, 'WarrantyActivated')
      .withArgs(productId, SHOP, BigInt(block!.timestamp), expiresAt, 24n);
    expect(await passport.ownerOf(productId)).to.equal(BUYER_PARTY);
    expect(await passport.custodianOf(productId)).to.equal(BUYER_PARTY);
    expect(await warranty.effectiveWarrantyState(productId)).to.equal(WARRANTY_ACTIVE);
    expect((await warranty.warrantyOf(productId)).expiresAt).to.equal(expiresAt);
  });

  it('sản phẩm không bảo hành (0 tháng) bán được nhưng không kích hoạt bảo hành', async () => {
    const { passport, warranty, atRetail, authorizeSale, sell, bob } =
      await networkHelpers.loadFixture(deployFixture);
    const productId = await atRetail('PK-0001', 0);

    await expect(sell(bob, await authorizeSale({ productId }))).not.to.emit(
      warranty,
      'WarrantyActivated',
    );
    expect(await passport.stateOf(productId)).to.equal(STATE.SOLD);
    expect(await warranty.effectiveWarrantyState(productId)).to.equal(0n);
  });

  it('chỉ nhà bán lẻ đang giữ hàng bán được, và chỉ khi hàng đã ở cửa hàng', async () => {
    const { passport, registerOne, atRetail, authorizeSale, sell, alice, bob, erin } =
      await networkHelpers.loadFixture(deployFixture);
    const inStock = await atRetail();
    const fresh = await registerOne('ABC-2026-000002');

    await expect(sell(bob, await authorizeSale({ productId: fresh })))
      .to.be.revertedWithCustomError(passport, 'InvalidStateTransition')
      .withArgs(STATE.CREATED, STATE.SOLD);
    await expect(sell(alice, await authorizeSale({ productId: inStock })))
      .to.be.revertedWithCustomError(passport, 'NotAuthorizedRetailer')
      .withArgs(alice.address);
    await expect(sell(erin, await authorizeSale({ productId: inStock, retailerId: OTHER_SHOP })))
      .to.be.revertedWithCustomError(passport, 'NotCustodian')
      .withArgs(inStock, OTHER_SHOP);

    await sell(bob, await authorizeSale({ productId: inStock }));
    await expect(sell(bob, await authorizeSale({ productId: inStock })))
      .to.be.revertedWithCustomError(passport, 'InvalidStateTransition')
      .withArgs(STATE.SOLD, STATE.SOLD);
  });

  it('giấy phép bán phải do registrar ký đúng người mua, đúng nhà bán lẻ, còn hạn', async () => {
    const { passport, atRetail, authorizeSale, sell, bob } =
      await networkHelpers.loadFixture(deployFixture);
    const productId = await atRetail();

    const genuine = await authorizeSale({ productId });
    await expect(sell(bob, { ...genuine, buyerId: CAROL_PARTY })).to.be.revertedWithCustomError(
      passport,
      'InvalidAuthorization',
    );
    await expect(
      sell(bob, await authorizeSale({ productId, retailerId: OTHER_SHOP })),
    ).to.be.revertedWithCustomError(passport, 'InvalidAuthorization');
    await expect(
      sell(bob, await authorizeSale({ productId }, Wallet.createRandom())),
    ).to.be.revertedWithCustomError(passport, 'InvalidAuthorization');
    const expired = await authorizeSale({
      productId,
      deadline: BigInt(await networkHelpers.time.latest()) - 1n,
    });
    await expect(sell(bob, expired))
      .to.be.revertedWithCustomError(passport, 'AuthorizationExpired')
      .withArgs(expired.deadline);
  });

  it('không bán cho tổ chức hoặc partyId rỗng', async () => {
    const { passport, atRetail, authorizeSale, sell, bob } =
      await networkHelpers.loadFixture(deployFixture);
    const productId = await atRetail();

    for (const buyerId of [MAKER, ZeroHash]) {
      await expect(sell(bob, await authorizeSale({ productId, buyerId })))
        .to.be.revertedWithCustomError(passport, 'InvalidBuyer')
        .withArgs(buyerId);
    }
  });

  it('digest EIP-712 ProductSale trong @dpp/shared khớp contract', async () => {
    const { passport, chainId } = await networkHelpers.loadFixture(deployFixture);
    const sale = {
      productId: partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000c1'),
      retailerId: SHOP,
      buyerId: BUYER_PARTY,
      deadline: 1_900_000_000n,
    };

    expect(
      await passport.productSaleDigest(
        sale.productId,
        sale.retailerId,
        sale.buyerId,
        sale.deadline,
      ),
    ).to.equal(productSaleDigest(chainId, await passport.getAddress(), sale));
  });
});

describe('ProductPassport – điểm nối cho M9, M10 và Admin', () => {
  it('M9: chỉ contract có TRANSFER_CONTRACT_ROLE đổi được chủ sở hữu', async () => {
    const { passport, registry, atRetail, authorizeSale, sell, admin, bob, dave } =
      await networkHelpers.loadFixture(deployFixture);
    const productId = await atRetail();
    const newOwner = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000b2');

    await expect(passport.connect(dave).transferOwnership(productId, BUYER_PARTY, newOwner))
      .to.be.revertedWithCustomError(passport, 'CallerNotAuthorized')
      .withArgs(dave.address);
    // Dave đóng vai contract chuyển nhượng ở M9.
    await registry.connect(admin).grantRole(TRANSFER_CONTRACT_ROLE, dave.address);
    await expect(passport.connect(dave).transferOwnership(productId, BUYER_PARTY, newOwner))
      .to.be.revertedWithCustomError(passport, 'InvalidStateTransition')
      .withArgs(STATE.AT_RETAIL, STATE.SOLD);

    await sell(bob, await authorizeSale({ productId }));
    await expect(passport.connect(dave).transferOwnership(productId, CAROL_PARTY, newOwner))
      .to.be.revertedWithCustomError(passport, 'NotOwner')
      .withArgs(productId, CAROL_PARTY);
    await expect(passport.connect(dave).transferOwnership(productId, BUYER_PARTY, newOwner))
      .to.emit(passport, 'OwnershipTransferred')
      .withArgs(productId, BUYER_PARTY, newOwner)
      .and.to.emit(passport, 'CustodyTransferred')
      .withArgs(productId, BUYER_PARTY, newOwner);
    expect(await passport.ownerOf(productId)).to.equal(newOwner);
  });

  it('M10: contract vòng đời thu hồi được cả hàng đang giao; báo mất chỉ khi đã có chủ', async () => {
    const { passport, registry, registerOne, admin, alice, dave } =
      await networkHelpers.loadFixture(deployFixture);
    const productId = await registerOne();
    await passport.connect(alice).dispatchCustody(productId, SHOP);

    await expect(
      passport.connect(dave).setLifecycleState(productId, STATE.RECALLED),
    ).to.be.revertedWithCustomError(passport, 'CallerNotAuthorized');
    await registry.connect(admin).grantRole(LIFECYCLE_CONTRACT_ROLE, dave.address);

    await expect(passport.connect(dave).setLifecycleState(productId, STATE.SOLD))
      .to.be.revertedWithCustomError(passport, 'InvalidLifecycleState')
      .withArgs(STATE.SOLD);
    await expect(passport.connect(dave).setLifecycleState(productId, STATE.LOST_STOLEN))
      .to.be.revertedWithCustomError(passport, 'InvalidStateTransition')
      .withArgs(STATE.IN_DISTRIBUTION, STATE.LOST_STOLEN);
    await expect(passport.connect(dave).setLifecycleState(productId, STATE.RECALLED))
      .to.emit(passport, 'CustodyHandoverCancelled')
      .withArgs(productId, MAKER, SHOP)
      .and.to.emit(passport, 'ProductStateChanged')
      .withArgs(productId, STATE.IN_DISTRIBUTION, STATE.RECALLED);
    expect(await passport.pendingCustodianOf(productId)).to.equal(ZeroHash);
  });

  it('chỉ Admin của PartyRegistry đổi được WarrantyManager', async () => {
    const { passport, warranty, admin, alice } = await networkHelpers.loadFixture(deployFixture);
    const replacement = Wallet.createRandom().address;

    await expect(passport.connect(alice).setWarrantyManager(replacement))
      .to.be.revertedWithCustomError(passport, 'CallerNotAuthorized')
      .withArgs(alice.address);
    await expect(passport.connect(admin).setWarrantyManager(replacement))
      .to.emit(passport, 'WarrantyManagerUpdated')
      .withArgs(await warranty.getAddress(), replacement);
    expect(await passport.warrantyManager()).to.equal(replacement);
    expect(DEFAULT_ADMIN_ROLE).to.equal(ZeroHash);
  });
});
