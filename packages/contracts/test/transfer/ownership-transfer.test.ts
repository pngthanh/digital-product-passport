import {
  encodeChainEnum,
  LIFECYCLE_CONTRACT_ROLE,
  partyIdFromUuid,
  RETAILER_ROLE,
  TRANSFER_AUTHORIZATION_TYPES,
  TRANSFER_CONTRACT_ROLE,
  type TransferAuthorization,
  transferAuthorizationDigest,
  transferDomain,
} from '@dpp/shared';
import { expect } from 'chai';
import { type BaseWallet, id, type Signer, Wallet, ZeroAddress } from 'ethers';
import { network } from 'hardhat';
import { CAROL_PARTY, OTHER_SHOP, passportFixture, STATE } from '../support/passport-fixture.js';

const connection = await network.create();
const { ethers, networkHelpers } = connection;
const deployPassport = passportFixture(connection);

const DAY = 24n * 60n * 60n;
const DAVE_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000004');
const PENDING_SHOP = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000a6');
const TRANSFER = {
  REQUESTED: encodeChainEnum('TransferState', 'REQUESTED'),
  COMPLETED: encodeChainEnum('TransferState', 'COMPLETED'),
  CANCELLED: encodeChainEnum('TransferState', 'CANCELLED'),
  REJECTED: encodeChainEnum('TransferState', 'REJECTED'),
  EXPIRED: encodeChainEnum('TransferState', 'EXPIRED'),
} as const;

async function now(): Promise<bigint> {
  return BigInt(await networkHelpers.time.latest());
}

/**
 * Fixture M6 cộng thêm: Carol mua một sản phẩm (đã liên kết ví), Dave là tài khoản cá nhân khác,
 * OTHER_SHOP (Erin đại diện) là tổ chức đã duyệt; OwnershipTransfer có TRANSFER_CONTRACT_ROLE.
 */
async function deployTransfer() {
  const fixture = await deployPassport();
  const { registry, passport, admin, bob, dave, registrar } = fixture;
  await fixture.registerUser(dave, DAVE_PARTY);
  const tickets = await ethers.deployContract('ServiceTicketsStub');
  const transfers = await ethers.deployContract('OwnershipTransfer', [
    await registry.getAddress(),
    await passport.getAddress(),
    await tickets.getAddress(),
  ]);
  await registry.connect(admin).grantRole(TRANSFER_CONTRACT_ROLE, await transfers.getAddress());
  const domain = transferDomain(fixture.chainId, await transfers.getAddress());

  /** Sản phẩm đã bán cho Carol. */
  async function owned(serial = 'ABC-2026-000001'): Promise<string> {
    const productId = await fixture.atRetail(serial);
    await fixture.sell(bob, await fixture.authorizeSale({ productId, buyerId: CAROL_PARTY }));
    return productId;
  }

  async function authorize(
    overrides: Partial<TransferAuthorization> & Pick<TransferAuthorization, 'productId'>,
    signer: BaseWallet = registrar,
  ): Promise<TransferAuthorization & { signature: string }> {
    const authorization: TransferAuthorization = {
      fromPartyId: CAROL_PARTY,
      toPartyId: DAVE_PARTY,
      expiresAt: (await now()) + 7n * DAY,
      deadline: await fixture.deadline(),
      ...overrides,
    };
    const signature = await signer.signTypedData(
      domain,
      TRANSFER_AUTHORIZATION_TYPES,
      authorization,
    );
    return { ...authorization, signature };
  }

  function create(wallet: Signer, permit: TransferAuthorization & { signature: string }) {
    return transfers
      .connect(wallet)
      .createTransferRequest(
        permit.productId,
        permit.toPartyId,
        permit.expiresAt,
        permit.deadline,
        permit.signature,
      );
  }

  return { ...fixture, tickets, transfers, owned, authorize, create };
}

describe('OwnershipTransfer – chuyển nhượng quyền sở hữu (TRF-01..05)', () => {
  it('TRF-01, TRF-03: chủ sở hữu tạo yêu cầu, bên nhận chấp nhận; owner, custody đổi, bảo hành đi theo', async () => {
    const { transfers, passport, warranty, carol, dave, owned, authorize, create } =
      await networkHelpers.loadFixture(deployTransfer);
    const productId = await owned();
    const permit = await authorize({ productId });

    await expect(create(carol, permit))
      .to.emit(transfers, 'TransferRequested')
      .withArgs(1n, productId, CAROL_PARTY, DAVE_PARTY, permit.expiresAt);
    expect(await transfers.activeRequestOf(productId)).to.equal(1n);
    expect((await transfers.request(1n)).state).to.equal(BigInt(TRANSFER.REQUESTED));

    await expect(transfers.connect(dave).acceptTransfer(1n))
      .to.emit(transfers, 'TransferAccepted')
      .withArgs(1n, productId, CAROL_PARTY, DAVE_PARTY)
      .and.to.emit(passport, 'OwnershipTransferred')
      .withArgs(productId, CAROL_PARTY, DAVE_PARTY)
      .and.to.emit(passport, 'CustodyTransferred')
      .withArgs(productId, CAROL_PARTY, DAVE_PARTY);
    const product = await passport.product(productId);
    expect(product.ownerId).to.equal(DAVE_PARTY);
    expect(product.custodianId).to.equal(DAVE_PARTY);
    expect(product.state).to.equal(STATE.SOLD);
    expect((await transfers.request(1n)).state).to.equal(BigInt(TRANSFER.COMPLETED));
    expect(await transfers.activeRequestOf(productId)).to.equal(0n);
    expect(await warranty.effectiveWarrantyState(productId)).to.equal(
      BigInt(encodeChainEnum('WarrantyState', 'ACTIVE')),
    );
  });

  it('chuyển cho tổ chức đã duyệt: người đại diện chấp nhận, rồi đứng tên tổ chức chuyển tiếp', async () => {
    const { transfers, passport, carol, erin, owned, authorize, create } =
      await networkHelpers.loadFixture(deployTransfer);
    const productId = await owned();
    await create(carol, await authorize({ productId, toPartyId: OTHER_SHOP }));
    await transfers.connect(erin).acceptTransfer(1n);
    expect((await passport.product(productId)).ownerId).to.equal(OTHER_SHOP);

    const onward = await authorize({ productId, fromPartyId: OTHER_SHOP, toPartyId: CAROL_PARTY });
    await expect(create(erin, onward))
      .to.emit(transfers, 'TransferRequested')
      .withArgs(2n, productId, OTHER_SHOP, CAROL_PARTY, onward.expiresAt);
  });

  it('chỉ chủ sở hữu tạo được, và chỉ khi sản phẩm đã bán', async () => {
    const { transfers, alice, dave, carol, atRetail, owned, authorize, create } =
      await networkHelpers.loadFixture(deployTransfer);
    const productId = await owned();
    for (const wallet of [dave, alice]) {
      await expect(create(wallet, await authorize({ productId })))
        .to.be.revertedWithCustomError(transfers, 'NotProductOwner')
        .withArgs(productId, wallet.address);
    }
    const unsold = await atRetail('ABC-2026-000002');
    await expect(create(carol, await authorize({ productId: unsold })))
      .to.be.revertedWithCustomError(transfers, 'ProductNotSold')
      .withArgs(unsold, STATE.AT_RETAIL);
  });

  it('bên nhận khác chủ sở hữu, tổ chức phải đã duyệt; giấy phép khoá bên nhận và thời hạn', async () => {
    const { transfers, carol, owned, authorize, create, organization, registerUser } =
      await networkHelpers.loadFixture(deployTransfer);
    const productId = await owned();
    await expect(create(carol, await authorize({ productId, toPartyId: CAROL_PARTY })))
      .to.be.revertedWithCustomError(transfers, 'InvalidRecipient')
      .withArgs(CAROL_PARTY);
    const [, , , , , , frank] = await ethers.getSigners();
    const frankParty = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000006');
    await registerUser(frank!, frankParty);
    await organization(frank!, frankParty, PENDING_SHOP, RETAILER_ROLE, false);
    await expect(create(carol, await authorize({ productId, toPartyId: PENDING_SHOP })))
      .to.be.revertedWithCustomError(transfers, 'InvalidRecipient')
      .withArgs(PENDING_SHOP);

    const permit = await authorize({ productId });
    await expect(create(carol, { ...permit, toPartyId: OTHER_SHOP })).to.be.revertedWithCustomError(
      transfers,
      'InvalidAuthorization',
    );
    await expect(
      create(carol, { ...permit, expiresAt: permit.expiresAt + 1n }),
    ).to.be.revertedWithCustomError(transfers, 'InvalidAuthorization');
    await expect(
      create(carol, await authorize({ productId }, Wallet.createRandom())),
    ).to.be.revertedWithCustomError(transfers, 'InvalidAuthorization');
  });

  it('thời hạn từ sau hiện tại tới tối đa 30 ngày; giấy phép quá hạn bị từ chối', async () => {
    const { transfers, carol, owned, authorize, create } =
      await networkHelpers.loadFixture(deployTransfer);
    const productId = await owned();
    const at = await now();
    for (const expiresAt of [at, at + 31n * DAY]) {
      await expect(create(carol, await authorize({ productId, expiresAt })))
        .to.be.revertedWithCustomError(transfers, 'InvalidExpiry')
        .withArgs(expiresAt);
    }
    const permit = await authorize({ productId, expiresAt: at + 30n * DAY });
    await networkHelpers.time.increaseTo(permit.deadline + 1n);
    await expect(create(carol, permit))
      .to.be.revertedWithCustomError(transfers, 'AuthorizationExpired')
      .withArgs(permit.deadline);
  });

  it('mỗi sản phẩm một yêu cầu mở; yêu cầu quá hạn tự đóng khi tạo yêu cầu mới', async () => {
    const { transfers, carol, owned, authorize, create } =
      await networkHelpers.loadFixture(deployTransfer);
    const productId = await owned();
    const first = await authorize({ productId, expiresAt: (await now()) + DAY });
    await create(carol, first);
    await expect(create(carol, await authorize({ productId })))
      .to.be.revertedWithCustomError(transfers, 'TransferAlreadyActive')
      .withArgs(productId, 1n);

    await networkHelpers.time.increaseTo(first.expiresAt + 1n);
    await expect(create(carol, await authorize({ productId })))
      .to.emit(transfers, 'TransferExpired')
      .withArgs(1n, productId)
      .and.to.emit(transfers, 'TransferRequested');
    expect(await transfers.activeRequestOf(productId)).to.equal(2n);
  });

  it('TRF-02, TRF-04: chỉ bên gửi huỷ, chỉ bên nhận từ chối; yêu cầu đã đóng không đổi được nữa', async () => {
    const { transfers, carol, dave, owned, authorize, create } =
      await networkHelpers.loadFixture(deployTransfer);
    const productId = await owned();
    await create(carol, await authorize({ productId }));
    await expect(transfers.connect(dave).cancelTransfer(1n))
      .to.be.revertedWithCustomError(transfers, 'NotSender')
      .withArgs(1n, dave.address);
    await expect(transfers.connect(carol).rejectTransfer(1n))
      .to.be.revertedWithCustomError(transfers, 'NotRecipient')
      .withArgs(1n, carol.address);
    await expect(transfers.connect(carol).cancelTransfer(1n))
      .to.emit(transfers, 'TransferCancelled')
      .withArgs(1n, productId);
    await expect(transfers.connect(dave).acceptTransfer(1n))
      .to.be.revertedWithCustomError(transfers, 'RequestNotOpen')
      .withArgs(1n, TRANSFER.CANCELLED);

    await create(carol, await authorize({ productId }));
    await expect(transfers.connect(dave).rejectTransfer(2n))
      .to.emit(transfers, 'TransferRejected')
      .withArgs(2n, productId);
    expect(await transfers.activeRequestOf(productId)).to.equal(0n);
  });

  it('TRF-05: quá hạn thì không chấp nhận được, ai cũng đóng được; chưa quá hạn thì không đóng', async () => {
    const { transfers, alice, carol, dave, owned, authorize, create } =
      await networkHelpers.loadFixture(deployTransfer);
    const productId = await owned();
    const permit = await authorize({ productId });
    await create(carol, permit);
    await expect(transfers.connect(alice).expireTransfer(1n))
      .to.be.revertedWithCustomError(transfers, 'RequestNotExpired')
      .withArgs(1n, permit.expiresAt);

    await networkHelpers.time.increaseTo(permit.expiresAt + 1n);
    await expect(transfers.connect(dave).acceptTransfer(1n))
      .to.be.revertedWithCustomError(transfers, 'RequestExpired')
      .withArgs(1n, permit.expiresAt);
    await expect(transfers.connect(alice).expireTransfer(1n))
      .to.emit(transfers, 'TransferExpired')
      .withArgs(1n, productId);
  });

  it('đang có phiếu sửa thì không tạo, không chấp nhận được; sản phẩm thu hồi thì không chấp nhận được', async () => {
    const { transfers, tickets, passport, registry, admin, carol, dave, owned, authorize, create } =
      await networkHelpers.loadFixture(deployTransfer);
    const productId = await owned();
    await create(carol, await authorize({ productId }));
    const ticket = id('phieu sua');
    await tickets.setOpenTicket(productId, ticket);
    await expect(transfers.connect(dave).acceptTransfer(1n))
      .to.be.revertedWithCustomError(transfers, 'ProductUnderRepair')
      .withArgs(productId, ticket);
    await transfers.connect(carol).cancelTransfer(1n);
    await expect(create(carol, await authorize({ productId })))
      .to.be.revertedWithCustomError(transfers, 'ProductUnderRepair')
      .withArgs(productId, ticket);

    await tickets.setOpenTicket(productId, `0x${'00'.repeat(32)}`);
    await create(carol, await authorize({ productId }));
    await registry.connect(admin).grantRole(LIFECYCLE_CONTRACT_ROLE, admin.address);
    await passport.connect(admin).setLifecycleState(productId, STATE.RECALLED);
    await expect(transfers.connect(dave).acceptTransfer(2n)).to.be.revertedWithCustomError(
      passport,
      'InvalidStateTransition',
    );
  });

  it('digest khớp @dpp/shared; từ chối địa chỉ 0 khi deploy', async () => {
    const { transfers, registry, chainId } = await networkHelpers.loadFixture(deployTransfer);
    const permit: TransferAuthorization = {
      productId: id('san pham'),
      fromPartyId: CAROL_PARTY,
      toPartyId: DAVE_PARTY,
      expiresAt: 1_900_000_000n,
      deadline: 123n,
    };
    expect(
      await transfers.transferAuthorizationDigest(
        permit.productId,
        permit.fromPartyId,
        permit.toPartyId,
        permit.expiresAt,
        permit.deadline,
      ),
    ).to.equal(transferAuthorizationDigest(chainId, await transfers.getAddress(), permit));
    await expect(
      ethers.deployContract('OwnershipTransfer', [
        await registry.getAddress(),
        ZeroAddress,
        ZeroAddress,
      ]),
    ).to.be.revertedWithCustomError(transfers, 'ZeroAddress');
  });
});
