import {
  MANUFACTURER_ROLE,
  PRODUCT_BATCH_MAX_SIZE,
  type ProductRegistration,
  partyIdFromUuid,
  partyRegistryDomain,
  productRegistrationDigest,
  statusReasonHash,
  WALLET_BINDING_TYPES,
} from '@dpp/shared';
import { expect } from 'chai';
import { id, Wallet, ZeroAddress, ZeroHash } from 'ethers';
import { network } from 'hardhat';
import {
  ALICE_PARTY,
  CAROL_PARTY,
  MAKER,
  passportFixture,
  products,
  SHOP,
  STATE,
  TTL_SECONDS,
} from '../support/passport-fixture.js';

const connection = await network.create();
const { ethers, networkHelpers } = connection;
const deployFixture = passportFixture(connection);
const PRODUCT_STATE_CREATED = STATE.CREATED;

async function deadline() {
  return BigInt((await networkHelpers.time.latest()) + TTL_SECONDS);
}

describe('ProductPassport – PRD-01, PRD-02 đăng ký sản phẩm', () => {
  it('nhà sản xuất đã duyệt đăng ký một sản phẩm: trạng thái CREATED, giữ hash hồ sơ', async () => {
    const { passport, authorize, register, alice } =
      await networkHelpers.loadFixture(deployFixture);
    const registration = await authorize();
    const [productId] = registration.productIds;
    const [metadataHash] = registration.metadataHashes;

    await expect(register(alice, registration))
      .to.emit(passport, 'ProductRegistered')
      .withArgs(productId, MAKER, metadataHash, 24);

    const stored = await passport.product(productId!);
    expect(stored.issuerId).to.equal(MAKER);
    expect(stored.metadataHash).to.equal(metadataHash);
    expect(stored.state).to.equal(PRODUCT_STATE_CREATED);
    expect(stored.warrantyMonths).to.equal(24n);
    expect(stored.custodianId).to.equal(MAKER);
    expect(stored.ownerId).to.equal(ZeroHash);
    expect(await passport.stateOf(productId!)).to.equal(PRODUCT_STATE_CREATED);
    expect(await passport.custodianOf(productId!)).to.equal(MAKER);
  });

  it(`một lô ${PRODUCT_BATCH_MAX_SIZE} sản phẩm (CSV) chỉ cần một giao dịch`, async () => {
    const { passport, authorize, register, alice } =
      await networkHelpers.loadFixture(deployFixture);
    const registration = await authorize(products(PRODUCT_BATCH_MAX_SIZE));

    const receipt = await (await register(alice, registration)).wait();

    expect(receipt?.logs).to.have.length(PRODUCT_BATCH_MAX_SIZE);
    expect(await passport.MAX_BATCH_SIZE()).to.equal(BigInt(PRODUCT_BATCH_MAX_SIZE));
    for (const productId of registration.productIds) {
      expect(await passport.stateOf(productId)).to.equal(PRODUCT_STATE_CREATED);
    }
  });

  it('lô rỗng hoặc vượt giới hạn, các mảng lệch độ dài thì revert', async () => {
    const { passport, authorize, register, alice } =
      await networkHelpers.loadFixture(deployFixture);

    await expect(register(alice, await authorize(products(0))))
      .to.be.revertedWithCustomError(passport, 'InvalidBatchSize')
      .withArgs(0n);
    await expect(register(alice, await authorize(products(PRODUCT_BATCH_MAX_SIZE + 1))))
      .to.be.revertedWithCustomError(passport, 'InvalidBatchSize')
      .withArgs(BigInt(PRODUCT_BATCH_MAX_SIZE + 1));
    const { productIds, metadataHashes, warrantyMonths } = products(2);
    await expect(
      register(
        alice,
        await authorize({ productIds, metadataHashes: [metadataHashes[0]!], warrantyMonths }),
      ),
    )
      .to.be.revertedWithCustomError(passport, 'LengthMismatch')
      .withArgs(2n, 1n, 2n);
    await expect(
      register(
        alice,
        await authorize({ productIds, metadataHashes, warrantyMonths: [warrantyMonths[0]!] }),
      ),
    )
      .to.be.revertedWithCustomError(passport, 'LengthMismatch')
      .withArgs(2n, 2n, 1n);
  });

  it('số tháng bảo hành khoá on-chain theo giấy phép, tối đa 120 tháng', async () => {
    const { passport, authorize, register, alice } =
      await networkHelpers.loadFixture(deployFixture);

    await expect(register(alice, await authorize(products(1, MAKER, 'W-', 121))))
      .to.be.revertedWithCustomError(passport, 'WarrantyTooLong')
      .withArgs(121n);

    const genuine = await authorize(products(1, MAKER, 'W-', 12));
    await expect(
      register(alice, { ...genuine, warrantyMonths: [36] }),
    ).to.be.revertedWithCustomError(passport, 'InvalidAuthorization');
    await register(alice, genuine);
    expect((await passport.product(genuine.productIds[0]!)).warrantyMonths).to.equal(12n);
  });

  it('chỉ người đại diện của nhà sản xuất đã duyệt mới đăng ký được', async () => {
    const { passport, authorize, register, bob, carol, dave } =
      await networkHelpers.loadFixture(deployFixture);
    const registration = await authorize();

    // Bob đại diện nhà bán lẻ, Carol có Party nhưng không đại diện tổ chức nào, Dave chưa liên kết ví.
    for (const wallet of [bob, carol, dave]) {
      await expect(register(wallet, registration))
        .to.be.revertedWithCustomError(passport, 'NotAuthorizedManufacturer')
        .withArgs(wallet.address);
    }
  });

  it('đơn nhà sản xuất chưa được duyệt hoặc đã bị khoá thì không đăng ký được', async () => {
    const { passport, registry, authorize, register, organization, admin, alice, carol } =
      await networkHelpers.loadFixture(deployFixture);
    const pendingMaker = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000a3');
    await organization(carol, CAROL_PARTY, pendingMaker, MANUFACTURER_ROLE, false);

    await expect(
      register(carol, await authorize({ issuerId: pendingMaker })),
    ).to.be.revertedWithCustomError(passport, 'NotAuthorizedManufacturer');

    await registry.connect(admin).disableOrganization(MAKER, statusReasonHash('Vi phạm'));
    await expect(register(alice, await authorize())).to.be.revertedWithCustomError(
      passport,
      'NotAuthorizedManufacturer',
    );
  });

  it('giấy phép cho nhà sản xuất khác thì báo IssuerMismatch', async () => {
    const { passport, authorize, register, alice } =
      await networkHelpers.loadFixture(deployFixture);

    await expect(register(alice, await authorize({ issuerId: SHOP, ...products(1, SHOP) })))
      .to.be.revertedWithCustomError(passport, 'IssuerMismatch')
      .withArgs(MAKER, SHOP);
  });

  it('giấy phép hết hạn, ký bằng khoá lạ hoặc bị sửa hồ sơ thì revert', async () => {
    const { passport, authorize, register, alice } =
      await networkHelpers.loadFixture(deployFixture);

    const expired = await authorize({
      deadline: BigInt(await networkHelpers.time.latest()) - 1n,
    });
    await expect(register(alice, expired))
      .to.be.revertedWithCustomError(passport, 'AuthorizationExpired')
      .withArgs(expired.deadline);

    await expect(
      register(alice, await authorize({}, Wallet.createRandom())),
    ).to.be.revertedWithCustomError(passport, 'InvalidAuthorization');

    const genuine = await authorize();
    const tampered = { ...genuine, metadataHashes: [id('ho so da bi sua')] };
    await expect(register(alice, tampered)).to.be.revertedWithCustomError(
      passport,
      'InvalidAuthorization',
    );
  });

  it('mỗi productId chỉ đăng ký một lần, kể cả trùng trong cùng một lô', async () => {
    const { passport, authorize, register, alice } =
      await networkHelpers.loadFixture(deployFixture);
    const first = await authorize();
    await register(alice, first);

    await expect(
      register(
        alice,
        await authorize({ productIds: first.productIds, metadataHashes: first.metadataHashes }),
      ),
    )
      .to.be.revertedWithCustomError(passport, 'ProductAlreadyRegistered')
      .withArgs(first.productIds[0]);

    const { productIds, metadataHashes } = products(1, MAKER, 'XYZ-');
    await expect(
      register(
        alice,
        await authorize({
          productIds: [productIds[0]!, productIds[0]!],
          metadataHashes: [metadataHashes[0]!, metadataHashes[0]!],
          warrantyMonths: [24, 24],
        }),
      ),
    ).to.be.revertedWithCustomError(passport, 'ProductAlreadyRegistered');
  });

  it('productId hoặc hash hồ sơ bằng 0 thì revert', async () => {
    const { passport, authorize, register, alice } =
      await networkHelpers.loadFixture(deployFixture);

    await expect(
      register(alice, await authorize({ productIds: [ZeroHash] })),
    ).to.be.revertedWithCustomError(passport, 'ZeroBytes32');
  });

  it('người đại diện đổi ví (ACC-04) thì ví mới đăng ký được, ví cũ không còn quyền (D26)', async () => {
    const { passport, registry, registrar, authorize, register, alice, dave, chainId } =
      await networkHelpers.loadFixture(deployFixture);
    const binding = {
      partyId: ALICE_PARTY,
      wallet: dave.address,
      previousWallet: alice.address,
      deadline: await deadline(),
    };
    const signature = await registrar.signTypedData(
      partyRegistryDomain(chainId, await registry.getAddress()),
      WALLET_BINDING_TYPES,
      binding,
    );
    await registry
      .connect(dave)
      .rotateWallet(ALICE_PARTY, alice.address, binding.deadline, signature);

    await expect(register(alice, await authorize())).to.be.revertedWithCustomError(
      passport,
      'NotAuthorizedManufacturer',
    );
    await expect(register(dave, await authorize())).to.emit(passport, 'ProductRegistered');
  });

  it('digest EIP-712 trong @dpp/shared khớp contract', async () => {
    const { passport, chainId } = await networkHelpers.loadFixture(deployFixture);
    const registration: ProductRegistration = {
      issuerId: MAKER,
      ...products(3),
      deadline: 1_900_000_000n,
    };

    expect(
      await passport.productRegistrationDigest(
        registration.issuerId,
        registration.productIds,
        registration.metadataHashes,
        registration.warrantyMonths,
        registration.deadline,
      ),
    ).to.equal(productRegistrationDigest(chainId, await passport.getAddress(), registration));
  });

  it('không deploy với địa chỉ PartyRegistry hoặc WarrantyManager rỗng', async () => {
    const { registry, warranty } = await networkHelpers.loadFixture(deployFixture);
    const passport = await ethers.getContractFactory('ProductPassport');

    await expect(
      ethers.deployContract('ProductPassport', [ZeroAddress, await warranty.getAddress()]),
    ).to.be.revertedWithCustomError(passport, 'ZeroAddress');
    await expect(
      ethers.deployContract('ProductPassport', [await registry.getAddress(), ZeroAddress]),
    ).to.be.revertedWithCustomError(passport, 'ZeroAddress');
  });
});
