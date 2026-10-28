import {
  partyIdFromUuid,
  partyRegistryDomain,
  REGISTRAR_ROLE,
  WALLET_BINDING_TYPES,
  type WalletBinding,
  walletBindingDigest,
} from '@dpp/shared';
import { expect } from 'chai';
import { type BaseWallet, Wallet, ZeroAddress, ZeroHash } from 'ethers';
import { network } from 'hardhat';

const { ethers, networkHelpers } = await network.create();

const PARTY_KIND_USER = 1n;
const ALICE_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000001');
const BOB_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000002');
const AUTHORIZATION_TTL_SECONDS = 15 * 60;

async function deployFixture() {
  const [admin, alice, bob, carol] = await ethers.getSigners();
  const registrar = Wallet.createRandom();
  const registry = await ethers.deployContract('PartyRegistry', [
    admin!.address,
    registrar.address,
  ]);
  const { chainId } = await ethers.provider.getNetwork();
  const registryAddress = await registry.getAddress();

  /** Backend ký giấy phép; mặc định hạn dùng 15 phút kể từ block hiện tại. */
  async function authorize(
    binding: Omit<WalletBinding, 'deadline'> & { deadline?: bigint },
    signer: BaseWallet = registrar,
  ) {
    const deadline =
      binding.deadline ?? BigInt((await networkHelpers.time.latest()) + AUTHORIZATION_TTL_SECONDS);
    const value: WalletBinding = { ...binding, deadline };
    const signature = await signer.signTypedData(
      partyRegistryDomain(Number(chainId), registryAddress),
      WALLET_BINDING_TYPES,
      value,
    );
    return { deadline, signature };
  }

  return {
    registry,
    registrar,
    authorize,
    chainId: Number(chainId),
    admin: admin!,
    alice: alice!,
    bob: bob!,
    carol: carol!,
  };
}

async function registeredFixture() {
  const context = await deployFixture();
  const { registry, authorize, alice } = context;
  const { deadline, signature } = await authorize({
    partyId: ALICE_PARTY,
    wallet: alice.address,
    previousWallet: ZeroAddress,
  });
  await registry.connect(alice).registerUser(ALICE_PARTY, deadline, signature);
  return context;
}

describe('PartyRegistry', () => {
  describe('registerUser (ACC-03)', () => {
    it('ví tự gửi giao dịch và trở thành ví cá nhân của Party', async () => {
      const { registry, authorize, alice } = await networkHelpers.loadFixture(deployFixture);
      const { deadline, signature } = await authorize({
        partyId: ALICE_PARTY,
        wallet: alice.address,
        previousWallet: ZeroAddress,
      });

      await expect(registry.connect(alice).registerUser(ALICE_PARTY, deadline, signature))
        .to.emit(registry, 'PartyRegistered')
        .withArgs(ALICE_PARTY, PARTY_KIND_USER, alice.address);

      expect(await registry.partyOf(alice.address)).to.equal(ALICE_PARTY);
      expect(await registry.walletOf(ALICE_PARTY)).to.equal(alice.address);
      expect(await registry.kindOf(ALICE_PARTY)).to.equal(PARTY_KIND_USER);
      expect(await registry.isWalletUsed(alice.address)).to.equal(true);
    });

    it('digest EIP-712 trên contract trùng digest @dpp/shared tính', async () => {
      const { registry, chainId, alice } = await networkHelpers.loadFixture(deployFixture);
      const binding: WalletBinding = {
        partyId: ALICE_PARTY,
        wallet: alice.address,
        previousWallet: ZeroAddress,
        deadline: 1_900_000_000n,
      };

      expect(
        await registry.walletBindingDigest(
          binding.partyId,
          binding.wallet,
          binding.previousWallet,
          binding.deadline,
        ),
      ).to.equal(walletBindingDigest(chainId, await registry.getAddress(), binding));
    });

    it('revert khi giấy phép đã hết hạn', async () => {
      const { registry, authorize, alice } = await networkHelpers.loadFixture(deployFixture);
      const { deadline, signature } = await authorize({
        partyId: ALICE_PARTY,
        wallet: alice.address,
        previousWallet: ZeroAddress,
      });
      await networkHelpers.time.increaseTo(deadline + 1n);

      await expect(registry.connect(alice).registerUser(ALICE_PARTY, deadline, signature))
        .to.be.revertedWithCustomError(registry, 'AuthorizationExpired')
        .withArgs(deadline);
    });

    it('revert khi giấy phép không do khoá REGISTRAR_ROLE ký', async () => {
      const { registry, authorize, alice } = await networkHelpers.loadFixture(deployFixture);
      const { deadline, signature } = await authorize(
        { partyId: ALICE_PARTY, wallet: alice.address, previousWallet: ZeroAddress },
        Wallet.createRandom(),
      );

      await expect(
        registry.connect(alice).registerUser(ALICE_PARTY, deadline, signature),
      ).to.be.revertedWithCustomError(registry, 'InvalidAuthorization');
    });

    it('revert khi ví khác dùng giấy phép cấp cho ví này', async () => {
      const { registry, authorize, alice, bob } = await networkHelpers.loadFixture(deployFixture);
      const { deadline, signature } = await authorize({
        partyId: ALICE_PARTY,
        wallet: alice.address,
        previousWallet: ZeroAddress,
      });

      await expect(
        registry.connect(bob).registerUser(ALICE_PARTY, deadline, signature),
      ).to.be.revertedWithCustomError(registry, 'InvalidAuthorization');
    });

    it('revert khi chữ ký sai độ dài', async () => {
      const { registry, alice } = await networkHelpers.loadFixture(deployFixture);
      const deadline = BigInt((await networkHelpers.time.latest()) + 60);

      await expect(
        registry.connect(alice).registerUser(ALICE_PARTY, deadline, `0x${'00'.repeat(64)}`),
      ).to.be.revertedWithCustomError(registry, 'InvalidAuthorization');
    });

    it('revert khi Party đã đăng ký', async () => {
      const { registry, authorize, bob } = await networkHelpers.loadFixture(registeredFixture);
      const { deadline, signature } = await authorize({
        partyId: ALICE_PARTY,
        wallet: bob.address,
        previousWallet: ZeroAddress,
      });

      await expect(registry.connect(bob).registerUser(ALICE_PARTY, deadline, signature))
        .to.be.revertedWithCustomError(registry, 'PartyAlreadyRegistered')
        .withArgs(ALICE_PARTY);
    });

    it('revert khi ví đã thuộc Party khác', async () => {
      const { registry, authorize, alice } = await networkHelpers.loadFixture(registeredFixture);
      const { deadline, signature } = await authorize({
        partyId: BOB_PARTY,
        wallet: alice.address,
        previousWallet: ZeroAddress,
      });

      await expect(registry.connect(alice).registerUser(BOB_PARTY, deadline, signature))
        .to.be.revertedWithCustomError(registry, 'WalletAlreadyUsed')
        .withArgs(alice.address);
    });

    it('revert khi partyId bằng 0', async () => {
      const { registry, authorize, alice } = await networkHelpers.loadFixture(deployFixture);
      const { deadline, signature } = await authorize({
        partyId: ZeroHash,
        wallet: alice.address,
        previousWallet: ZeroAddress,
      });

      await expect(
        registry.connect(alice).registerUser(ZeroHash, deadline, signature),
      ).to.be.revertedWithCustomError(registry, 'ZeroBytes32');
    });

    it('giấy phép mất hiệu lực ngay khi admin thu hồi REGISTRAR_ROLE', async () => {
      const { registry, registrar, authorize, admin, alice } =
        await networkHelpers.loadFixture(deployFixture);
      const { deadline, signature } = await authorize({
        partyId: ALICE_PARTY,
        wallet: alice.address,
        previousWallet: ZeroAddress,
      });
      await registry.connect(admin).revokeRole(REGISTRAR_ROLE, registrar.address);

      await expect(
        registry.connect(alice).registerUser(ALICE_PARTY, deadline, signature),
      ).to.be.revertedWithCustomError(registry, 'InvalidAuthorization');
    });
  });

  describe('rotateWallet (ACC-04)', () => {
    it('ví mới thay ví cũ, ví cũ không còn đại diện cho Party', async () => {
      const { registry, authorize, alice, bob } =
        await networkHelpers.loadFixture(registeredFixture);
      const { deadline, signature } = await authorize({
        partyId: ALICE_PARTY,
        wallet: bob.address,
        previousWallet: alice.address,
      });

      await expect(
        registry.connect(bob).rotateWallet(ALICE_PARTY, alice.address, deadline, signature),
      )
        .to.emit(registry, 'WalletRotated')
        .withArgs(ALICE_PARTY, alice.address, bob.address);

      expect(await registry.partyOf(alice.address)).to.equal(ZeroHash);
      expect(await registry.partyOf(bob.address)).to.equal(ALICE_PARTY);
      expect(await registry.walletOf(ALICE_PARTY)).to.equal(bob.address);
      expect(await registry.isWalletUsed(alice.address)).to.equal(true);
    });

    it('revert khi ví trước đó không còn là ví hiện tại', async () => {
      const { registry, authorize, alice, bob, carol } =
        await networkHelpers.loadFixture(registeredFixture);
      const { deadline, signature } = await authorize({
        partyId: ALICE_PARTY,
        wallet: carol.address,
        previousWallet: bob.address,
      });

      await expect(
        registry.connect(carol).rotateWallet(ALICE_PARTY, bob.address, deadline, signature),
      )
        .to.be.revertedWithCustomError(registry, 'StalePreviousWallet')
        .withArgs(ALICE_PARTY, alice.address);
    });

    it('revert khi quay lại ví đã từng dùng', async () => {
      const { registry, authorize, alice, bob } =
        await networkHelpers.loadFixture(registeredFixture);
      const toBob = await authorize({
        partyId: ALICE_PARTY,
        wallet: bob.address,
        previousWallet: alice.address,
      });
      await registry
        .connect(bob)
        .rotateWallet(ALICE_PARTY, alice.address, toBob.deadline, toBob.signature);
      const backToAlice = await authorize({
        partyId: ALICE_PARTY,
        wallet: alice.address,
        previousWallet: bob.address,
      });

      await expect(
        registry
          .connect(alice)
          .rotateWallet(ALICE_PARTY, bob.address, backToAlice.deadline, backToAlice.signature),
      )
        .to.be.revertedWithCustomError(registry, 'WalletAlreadyUsed')
        .withArgs(alice.address);
    });

    it('revert khi Party chưa đăng ký', async () => {
      const { registry, authorize, alice, bob } = await networkHelpers.loadFixture(deployFixture);
      const { deadline, signature } = await authorize({
        partyId: BOB_PARTY,
        wallet: bob.address,
        previousWallet: alice.address,
      });

      await expect(
        registry.connect(bob).rotateWallet(BOB_PARTY, alice.address, deadline, signature),
      )
        .to.be.revertedWithCustomError(registry, 'PartyNotRegistered')
        .withArgs(BOB_PARTY);
    });

    it('không dùng được giấy phép đăng ký lần đầu để xoay ví', async () => {
      const { registry, authorize, alice, bob } =
        await networkHelpers.loadFixture(registeredFixture);
      const { deadline, signature } = await authorize({
        partyId: ALICE_PARTY,
        wallet: bob.address,
        previousWallet: ZeroAddress,
      });

      await expect(
        registry.connect(bob).rotateWallet(ALICE_PARTY, alice.address, deadline, signature),
      ).to.be.revertedWithCustomError(registry, 'InvalidAuthorization');
    });

    it('revert khi giấy phép xoay ví đã hết hạn', async () => {
      const { registry, authorize, alice, bob } =
        await networkHelpers.loadFixture(registeredFixture);
      const { deadline, signature } = await authorize({
        partyId: ALICE_PARTY,
        wallet: bob.address,
        previousWallet: alice.address,
      });
      await networkHelpers.time.increaseTo(deadline + 1n);

      await expect(
        registry.connect(bob).rotateWallet(ALICE_PARTY, alice.address, deadline, signature),
      ).to.be.revertedWithCustomError(registry, 'AuthorizationExpired');
    });
  });

  describe('Phân quyền', () => {
    it('không deploy được với địa chỉ 0', async () => {
      const { registry, registrar, admin } = await networkHelpers.loadFixture(deployFixture);

      await expect(
        ethers.deployContract('PartyRegistry', [ZeroAddress, registrar.address]),
      ).to.be.revertedWithCustomError(registry, 'ZeroAddress');
      await expect(
        ethers.deployContract('PartyRegistry', [admin.address, ZeroAddress]),
      ).to.be.revertedWithCustomError(registry, 'ZeroAddress');
    });

    it('chỉ admin cấp được REGISTRAR_ROLE', async () => {
      const { registry, alice, bob } = await networkHelpers.loadFixture(deployFixture);

      await expect(registry.connect(alice).grantRole(REGISTRAR_ROLE, bob.address))
        .to.be.revertedWithCustomError(registry, 'AccessControlUnauthorizedAccount')
        .withArgs(alice.address, ZeroHash);
    });
  });
});
