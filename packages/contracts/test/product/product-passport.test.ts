import {
  MANUFACTURER_ROLE,
  ORGANIZATION_APPLICATION_TYPES,
  PRODUCT_BATCH_MAX_SIZE,
  PRODUCT_REGISTRATION_TYPES,
  type ProductRegistration,
  partyIdFromUuid,
  partyRegistryDomain,
  productIdOf,
  productPassportDomain,
  productRegistrationDigest,
  RETAILER_ROLE,
  statusReasonHash,
  WALLET_BINDING_TYPES,
} from '@dpp/shared';
import { expect } from 'chai';
import { type BaseWallet, id, type Signer, Wallet, ZeroAddress, ZeroHash } from 'ethers';
import { network } from 'hardhat';

const { ethers, networkHelpers } = await network.create();

const PRODUCT_STATE_CREATED = 1n;
const ALICE_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000001');
const BOB_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000002');
const CAROL_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000003');
const MAKER = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000a1');
const SHOP = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000a2');
const TTL_SECONDS = 15 * 60;

async function deadline() {
  return BigInt((await networkHelpers.time.latest()) + TTL_SECONDS);
}

function products(count: number, issuer = MAKER, prefix = 'ABC-2026-') {
  const productIds = Array.from({ length: count }, (_, index) =>
    productIdOf(issuer, `${prefix}${String(index + 1).padStart(6, '0')}`),
  );
  const metadataHashes = productIds.map((productId) => id(`ho so ${productId}`));
  return { productIds, metadataHashes };
}

/** PartyRegistry có nhà sản xuất MAKER (Alice đại diện, đã duyệt) và nhà bán lẻ SHOP (Bob đại diện). */
async function deployFixture() {
  const [admin, alice, bob, carol, dave] = await ethers.getSigners();
  const registrar = Wallet.createRandom();
  const registry = await ethers.deployContract('PartyRegistry', [
    admin!.address,
    registrar.address,
    admin!.address,
    0n,
  ]);
  const passport = await ethers.deployContract('ProductPassport', [await registry.getAddress()]);
  const { chainId } = await ethers.provider.getNetwork();
  const registryDomain = partyRegistryDomain(Number(chainId), await registry.getAddress());
  const passportDomain = productPassportDomain(Number(chainId), await passport.getAddress());

  async function registerUser(wallet: Signer & { address: string }, partyId: string) {
    const binding = { partyId, wallet: wallet.address, previousWallet: ZeroAddress };
    const value = { ...binding, deadline: await deadline() };
    const signature = await registrar.signTypedData(registryDomain, WALLET_BINDING_TYPES, value);
    await registry.connect(wallet).registerUser(partyId, value.deadline, signature);
  }

  async function organization(
    representative: Signer & { address: string },
    representativeId: string,
    partyId: string,
    role: string,
    approve: boolean,
  ) {
    const application = {
      partyId,
      representativeId,
      role,
      profileHash: id(`ho so ${partyId}`),
      deadline: await deadline(),
    };
    const signature = await registrar.signTypedData(
      registryDomain,
      ORGANIZATION_APPLICATION_TYPES,
      application,
    );
    await registry
      .connect(representative)
      .applyOrganization(partyId, role, application.profileHash, application.deadline, signature);
    if (approve) {
      await registry.connect(admin!).approveOrganization(partyId);
    }
  }

  /** Giấy phép registrar cấp cho lô sản phẩm; `signer` khác registrar để thử chữ ký sai. */
  async function authorize(
    overrides: Partial<ProductRegistration> = {},
    signer: BaseWallet = registrar,
  ): Promise<ProductRegistration & { signature: string }> {
    const registration: ProductRegistration = {
      issuerId: MAKER,
      ...products(1),
      deadline: await deadline(),
      ...overrides,
    };
    const signature = await signer.signTypedData(
      passportDomain,
      PRODUCT_REGISTRATION_TYPES,
      registration,
    );
    return { ...registration, signature };
  }

  function register(wallet: Signer, registration: ProductRegistration & { signature: string }) {
    return passport
      .connect(wallet)
      .registerProducts(
        registration.issuerId,
        registration.productIds,
        registration.metadataHashes,
        registration.deadline,
        registration.signature,
      );
  }

  await registerUser(alice!, ALICE_PARTY);
  await registerUser(bob!, BOB_PARTY);
  await registerUser(carol!, CAROL_PARTY);
  await organization(alice!, ALICE_PARTY, MAKER, MANUFACTURER_ROLE, true);
  await organization(bob!, BOB_PARTY, SHOP, RETAILER_ROLE, true);

  return {
    registry,
    passport,
    registrar,
    authorize,
    register,
    registerUser,
    organization,
    chainId: Number(chainId),
    admin: admin!,
    alice: alice!,
    bob: bob!,
    carol: carol!,
    dave: dave!,
  };
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
      .withArgs(productId, MAKER, metadataHash);

    const stored = await passport.product(productId!);
    expect(stored.issuerId).to.equal(MAKER);
    expect(stored.metadataHash).to.equal(metadataHash);
    expect(stored.state).to.equal(PRODUCT_STATE_CREATED);
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

  it('lô rỗng hoặc vượt giới hạn, hai mảng lệch độ dài thì revert', async () => {
    const { passport, authorize, register, alice } =
      await networkHelpers.loadFixture(deployFixture);

    await expect(register(alice, await authorize(products(0))))
      .to.be.revertedWithCustomError(passport, 'InvalidBatchSize')
      .withArgs(0n);
    await expect(register(alice, await authorize(products(PRODUCT_BATCH_MAX_SIZE + 1))))
      .to.be.revertedWithCustomError(passport, 'InvalidBatchSize')
      .withArgs(BigInt(PRODUCT_BATCH_MAX_SIZE + 1));
    const { productIds, metadataHashes } = products(2);
    await expect(
      register(alice, await authorize({ productIds, metadataHashes: [metadataHashes[0]!] })),
    )
      .to.be.revertedWithCustomError(passport, 'LengthMismatch')
      .withArgs(2n, 1n);
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

    await expect(register(alice, await authorize({ productIds: first.productIds })))
      .to.be.revertedWithCustomError(passport, 'ProductAlreadyRegistered')
      .withArgs(first.productIds[0]);

    const { productIds, metadataHashes } = products(1, MAKER, 'XYZ-');
    await expect(
      register(
        alice,
        await authorize({
          productIds: [productIds[0]!, productIds[0]!],
          metadataHashes: [metadataHashes[0]!, metadataHashes[0]!],
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
        registration.deadline,
      ),
    ).to.equal(productRegistrationDigest(chainId, await passport.getAddress(), registration));
  });

  it('không deploy với địa chỉ PartyRegistry rỗng', async () => {
    const passport = await ethers.getContractFactory('ProductPassport');

    await expect(
      ethers.deployContract('ProductPassport', [ZeroAddress]),
    ).to.be.revertedWithCustomError(passport, 'ZeroAddress');
  });
});
