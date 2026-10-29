import {
  FEE_ACTION_IDS,
  MANUFACTURER_ROLE,
  ORGANIZATION_APPLICATION_TYPES,
  type OrganizationApplication,
  organizationApplicationDigest,
  partyIdFromUuid,
  partyRegistryDomain,
  REGISTRAR_ROLE,
  RETAILER_ROLE,
  statusReasonHash,
  WALLET_BINDING_TYPES,
} from '@dpp/shared';
import { expect } from 'chai';
import { id, parseEther, type Signer, Wallet, ZeroAddress, ZeroHash } from 'ethers';
import { network } from 'hardhat';

const { ethers, networkHelpers } = await network.create();

const PARTY_KIND_ORGANIZATION = 2n;
const STATUS = { PENDING: 1n, AUTHORIZED: 2n, REJECTED: 3n, DISABLED: 4n } as const;
const ALICE_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000001');
const BOB_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000002');
const ORG_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000a1');
const OTHER_ORG_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000a2');
const PROFILE_HASH = id('ho so ABC Electronics');
const REGISTRATION_FEE = parseEther('8');
const ORG_REGISTRATION = FEE_ACTION_IDS.ORG_REGISTRATION;
const TTL_SECONDS = 15 * 60;

async function deadline() {
  return BigInt((await networkHelpers.time.latest()) + TTL_SECONDS);
}

async function deployFixture() {
  const [admin, alice, bob, carol, dave, treasury] = await ethers.getSigners();
  const registrar = Wallet.createRandom();
  const registry = await ethers.deployContract('PartyRegistry', [
    admin!.address,
    registrar.address,
    treasury!.address,
    REGISTRATION_FEE,
  ]);
  const { chainId } = await ethers.provider.getNetwork();
  const domain = partyRegistryDomain(Number(chainId), await registry.getAddress());

  /** ACC-03: ví tự đăng ký Party người dùng (điều kiện để làm người đại diện). */
  async function registerUser(wallet: Signer & { address: string }, partyId: string) {
    const binding = {
      partyId,
      wallet: wallet.address,
      previousWallet: ZeroAddress,
      deadline: await deadline(),
    };
    const signature = await registrar.signTypedData(domain, WALLET_BINDING_TYPES, binding);
    await registry.connect(wallet).registerUser(partyId, binding.deadline, signature);
  }

  async function authorizeApplication(
    overrides: Partial<OrganizationApplication> = {},
  ): Promise<OrganizationApplication & { signature: string }> {
    const application: OrganizationApplication = {
      partyId: ORG_PARTY,
      representativeId: ALICE_PARTY,
      role: MANUFACTURER_ROLE,
      profileHash: PROFILE_HASH,
      deadline: await deadline(),
      ...overrides,
    };
    const signature = await registrar.signTypedData(
      domain,
      ORGANIZATION_APPLICATION_TYPES,
      application,
    );
    return { ...application, signature };
  }

  await registerUser(alice!, ALICE_PARTY);
  await registerUser(bob!, BOB_PARTY);

  return {
    registry,
    registrar,
    domain,
    registerUser,
    authorizeApplication,
    chainId: Number(chainId),
    admin: admin!,
    alice: alice!,
    bob: bob!,
    carol: carol!,
    dave: dave!,
    treasury: treasury!,
  };
}

async function appliedFixture() {
  const context = await deployFixture();
  const { registry, authorizeApplication, alice } = context;
  const application = await authorizeApplication();
  await registry
    .connect(alice)
    .applyOrganization(
      application.partyId,
      application.role,
      application.profileHash,
      application.deadline,
      application.signature,
      { value: REGISTRATION_FEE },
    );
  return context;
}

async function rejectedFixture() {
  const context = await appliedFixture();
  await context.registry
    .connect(context.admin)
    .rejectOrganization(ORG_PARTY, statusReasonHash('Thiếu giấy phép'));
  return context;
}

describe('PartyRegistry – tổ chức và phí', () => {
  describe('applyOrganization (ORG-01)', () => {
    it('người đại diện nộp đơn bằng ví cá nhân, contract giữ 8 MON chờ duyệt', async () => {
      const { registry, authorizeApplication, alice } =
        await networkHelpers.loadFixture(deployFixture);
      const app = await authorizeApplication();

      const tx = registry
        .connect(alice)
        .applyOrganization(app.partyId, app.role, app.profileHash, app.deadline, app.signature, {
          value: REGISTRATION_FEE,
        });

      await expect(tx)
        .to.emit(registry, 'PartyRegistered')
        .withArgs(ORG_PARTY, PARTY_KIND_ORGANIZATION, ZeroAddress);
      await expect(tx)
        .to.emit(registry, 'OrganizationApplied')
        .withArgs(ORG_PARTY, ALICE_PARTY, MANUFACTURER_ROLE, PROFILE_HASH);
      await expect(tx)
        .to.emit(registry, 'FeePaid')
        .withArgs(ORG_PARTY, ORG_REGISTRATION, alice.address, REGISTRATION_FEE);
      await expect(tx).to.changeEtherBalances(
        ethers,
        [alice, registry],
        [-REGISTRATION_FEE, REGISTRATION_FEE],
      );

      const organization = await registry.organization(ORG_PARTY);
      expect(organization.representativeId).to.equal(ALICE_PARTY);
      expect(organization.status).to.equal(STATUS.PENDING);
      expect(await registry.organizationOf(ALICE_PARTY)).to.equal(ORG_PARTY);
      expect(await registry.escrowedFeeOf(ORG_PARTY)).to.equal(REGISTRATION_FEE);
      expect(await registry.walletOf(ORG_PARTY)).to.equal(ZeroAddress);
    });

    it('digest EIP-712 trên contract trùng digest @dpp/shared tính', async () => {
      const { registry, chainId } = await networkHelpers.loadFixture(deployFixture);
      const application: OrganizationApplication = {
        partyId: ORG_PARTY,
        representativeId: ALICE_PARTY,
        role: MANUFACTURER_ROLE,
        profileHash: PROFILE_HASH,
        deadline: 1_900_000_000n,
      };

      expect(
        await registry.organizationApplicationDigest(
          application.partyId,
          application.representativeId,
          application.role,
          application.profileHash,
          application.deadline,
        ),
      ).to.equal(organizationApplicationDigest(chainId, await registry.getAddress(), application));
    });

    it('revert khi số MON gửi kèm khác phí hiện hành', async () => {
      const { registry, authorizeApplication, alice } =
        await networkHelpers.loadFixture(deployFixture);
      const app = await authorizeApplication();
      const args = [app.partyId, app.role, app.profileHash, app.deadline, app.signature] as const;

      await expect(registry.connect(alice).applyOrganization(...args, { value: parseEther('7') }))
        .to.be.revertedWithCustomError(registry, 'IncorrectFeeAmount')
        .withArgs(REGISTRATION_FEE, parseEther('7'));
      await expect(
        registry.connect(alice).applyOrganization(...args, { value: parseEther('10') }),
      ).to.be.revertedWithCustomError(registry, 'IncorrectFeeAmount');
    });

    it('revert khi ví gửi chưa liên kết với tài khoản nào', async () => {
      const { registry, authorizeApplication, carol } =
        await networkHelpers.loadFixture(deployFixture);
      const app = await authorizeApplication();

      await expect(
        registry
          .connect(carol)
          .applyOrganization(app.partyId, app.role, app.profileHash, app.deadline, app.signature, {
            value: REGISTRATION_FEE,
          }),
      )
        .to.be.revertedWithCustomError(registry, 'WalletNotLinked')
        .withArgs(carol.address);
    });

    it('người khác không dùng được giấy phép cấp cho người đại diện', async () => {
      const { registry, authorizeApplication, bob } =
        await networkHelpers.loadFixture(deployFixture);
      const app = await authorizeApplication();

      await expect(
        registry
          .connect(bob)
          .applyOrganization(app.partyId, app.role, app.profileHash, app.deadline, app.signature, {
            value: REGISTRATION_FEE,
          }),
      ).to.be.revertedWithCustomError(registry, 'InvalidAuthorization');
    });

    it('revert khi role không phải role nghiệp vụ của tổ chức', async () => {
      const { registry, authorizeApplication, alice } =
        await networkHelpers.loadFixture(deployFixture);
      const app = await authorizeApplication({ role: REGISTRAR_ROLE });

      await expect(
        registry
          .connect(alice)
          .applyOrganization(app.partyId, app.role, app.profileHash, app.deadline, app.signature, {
            value: REGISTRATION_FEE,
          }),
      )
        .to.be.revertedWithCustomError(registry, 'UnknownOrganizationRole')
        .withArgs(REGISTRAR_ROLE);
    });

    it('revert khi hồ sơ rỗng hoặc giấy phép hết hạn', async () => {
      const { registry, authorizeApplication, alice } =
        await networkHelpers.loadFixture(deployFixture);
      const empty = await authorizeApplication({ profileHash: ZeroHash });
      await expect(
        registry
          .connect(alice)
          .applyOrganization(
            empty.partyId,
            empty.role,
            empty.profileHash,
            empty.deadline,
            empty.signature,
            { value: REGISTRATION_FEE },
          ),
      ).to.be.revertedWithCustomError(registry, 'ZeroBytes32');

      const expired = await authorizeApplication();
      await networkHelpers.time.increaseTo(expired.deadline + 1n);
      await expect(
        registry
          .connect(alice)
          .applyOrganization(
            expired.partyId,
            expired.role,
            expired.profileHash,
            expired.deadline,
            expired.signature,
            { value: REGISTRATION_FEE },
          ),
      ).to.be.revertedWithCustomError(registry, 'AuthorizationExpired');
    });

    it('mỗi người đại diện tối đa một tổ chức; đơn đang chờ không nộp lại được', async () => {
      const { registry, authorizeApplication, alice } =
        await networkHelpers.loadFixture(appliedFixture);
      const second = await authorizeApplication({ partyId: OTHER_ORG_PARTY });
      await expect(
        registry
          .connect(alice)
          .applyOrganization(
            second.partyId,
            second.role,
            second.profileHash,
            second.deadline,
            second.signature,
            { value: REGISTRATION_FEE },
          ),
      )
        .to.be.revertedWithCustomError(registry, 'RepresentativeHasOrganization')
        .withArgs(ALICE_PARTY, ORG_PARTY);

      const again = await authorizeApplication();
      await expect(
        registry
          .connect(alice)
          .applyOrganization(
            again.partyId,
            again.role,
            again.profileHash,
            again.deadline,
            again.signature,
            { value: REGISTRATION_FEE },
          ),
      )
        .to.be.revertedWithCustomError(registry, 'InvalidOrganizationStatus')
        .withArgs(ORG_PARTY, STATUS.PENDING);
    });
  });

  describe('Duyệt, từ chối, khoá (ORG-02..04)', () => {
    it('ORG-02: Admin duyệt, phí chuyển về Treasury, tổ chức có role nghiệp vụ', async () => {
      const { registry, admin, alice, treasury } = await networkHelpers.loadFixture(appliedFixture);

      const tx = registry.connect(admin).approveOrganization(ORG_PARTY);

      await expect(tx)
        .to.emit(registry, 'OrganizationApproved')
        .withArgs(ORG_PARTY, MANUFACTURER_ROLE);
      await expect(tx)
        .to.emit(registry, 'FeeSettled')
        .withArgs(ORG_PARTY, treasury.address, REGISTRATION_FEE);
      await expect(tx).to.changeEtherBalances(
        ethers,
        [registry, treasury],
        [-REGISTRATION_FEE, REGISTRATION_FEE],
      );
      expect(await registry.hasPartyRole(ORG_PARTY, MANUFACTURER_ROLE)).to.equal(true);
      expect(await registry.authorizedOrganizationOf(alice.address, MANUFACTURER_ROLE)).to.equal(
        ORG_PARTY,
      );
      expect(await registry.authorizedOrganizationOf(alice.address, RETAILER_ROLE)).to.equal(
        ZeroHash,
      );
    });

    it('chỉ Admin duyệt, từ chối, khoá được; mỗi thao tác chỉ từ đúng trạng thái', async () => {
      const { registry, admin, alice } = await networkHelpers.loadFixture(appliedFixture);

      await expect(registry.connect(alice).approveOrganization(ORG_PARTY))
        .to.be.revertedWithCustomError(registry, 'AccessControlUnauthorizedAccount')
        .withArgs(alice.address, ZeroHash);
      await expect(
        registry.connect(alice).rejectOrganization(ORG_PARTY, ZeroHash),
      ).to.be.revertedWithCustomError(registry, 'AccessControlUnauthorizedAccount');
      await expect(registry.connect(admin).disableOrganization(ORG_PARTY, ZeroHash))
        .to.be.revertedWithCustomError(registry, 'InvalidOrganizationStatus')
        .withArgs(ORG_PARTY, STATUS.PENDING);

      await registry.connect(admin).approveOrganization(ORG_PARTY);
      await expect(registry.connect(admin).approveOrganization(ORG_PARTY))
        .to.be.revertedWithCustomError(registry, 'InvalidOrganizationStatus')
        .withArgs(ORG_PARTY, STATUS.AUTHORIZED);
    });

    it('ORG-03: từ chối giữ phí chờ người đại diện tự rút về ví cá nhân', async () => {
      const { registry, admin, alice, bob } = await networkHelpers.loadFixture(appliedFixture);
      const reasonHash = statusReasonHash('Mã số thuế không khớp');

      await expect(registry.connect(admin).rejectOrganization(ORG_PARTY, reasonHash))
        .to.emit(registry, 'OrganizationRejected')
        .withArgs(ORG_PARTY, reasonHash);
      expect(await registry.refundableFeeOf(ORG_PARTY)).to.equal(REGISTRATION_FEE);
      expect(await registry.escrowedFeeOf(ORG_PARTY)).to.equal(0n);

      await expect(registry.connect(bob).withdrawRefund(ORG_PARTY))
        .to.be.revertedWithCustomError(registry, 'NotRepresentative')
        .withArgs(ORG_PARTY, bob.address);

      const refund = registry.connect(alice).withdrawRefund(ORG_PARTY);
      await expect(refund)
        .to.emit(registry, 'FeeRefunded')
        .withArgs(ORG_PARTY, alice.address, REGISTRATION_FEE);
      await expect(refund).to.changeEtherBalances(
        ethers,
        [registry, alice],
        [-REGISTRATION_FEE, REGISTRATION_FEE],
      );
      await expect(registry.connect(alice).withdrawRefund(ORG_PARTY))
        .to.be.revertedWithCustomError(registry, 'NothingToRefund')
        .withArgs(ORG_PARTY);
    });

    it('đơn bị từ chối được nộp lại với hồ sơ mới và phí mới; phí cũ vẫn rút được', async () => {
      const { registry, authorizeApplication, admin, alice } =
        await networkHelpers.loadFixture(rejectedFixture);
      const fixedProfile = id('ho so da sua');
      const app = await authorizeApplication({ role: RETAILER_ROLE, profileHash: fixedProfile });

      await expect(
        registry
          .connect(alice)
          .applyOrganization(app.partyId, app.role, app.profileHash, app.deadline, app.signature, {
            value: REGISTRATION_FEE,
          }),
      )
        .to.emit(registry, 'OrganizationApplied')
        .withArgs(ORG_PARTY, ALICE_PARTY, RETAILER_ROLE, fixedProfile)
        .and.not.to.emit(registry, 'PartyRegistered');
      expect(await registry.escrowedFeeOf(ORG_PARTY)).to.equal(REGISTRATION_FEE);
      expect(await registry.refundableFeeOf(ORG_PARTY)).to.equal(REGISTRATION_FEE);

      await registry.connect(admin).approveOrganization(ORG_PARTY);
      expect(await registry.hasPartyRole(ORG_PARTY, RETAILER_ROLE)).to.equal(true);
      await expect(registry.connect(alice).withdrawRefund(ORG_PARTY)).to.emit(
        registry,
        'FeeRefunded',
      );
    });

    it('đổi ví cá nhân thì quyền thao tác cho tổ chức và tiền hoàn đi theo ví mới', async () => {
      const { registry, registrar, domain, admin, alice, dave } =
        await networkHelpers.loadFixture(rejectedFixture);
      const binding = {
        partyId: ALICE_PARTY,
        wallet: dave.address,
        previousWallet: alice.address,
        deadline: await deadline(),
      };
      const signature = await registrar.signTypedData(domain, WALLET_BINDING_TYPES, binding);
      await registry
        .connect(dave)
        .rotateWallet(ALICE_PARTY, alice.address, binding.deadline, signature);

      await expect(registry.connect(alice).withdrawRefund(ORG_PARTY)).to.be.revertedWithCustomError(
        registry,
        'NotRepresentative',
      );
      await expect(registry.connect(dave).withdrawRefund(ORG_PARTY))
        .to.emit(registry, 'FeeRefunded')
        .withArgs(ORG_PARTY, dave.address, REGISTRATION_FEE);
      expect(await registry.connect(admin).organizationOf(ALICE_PARTY)).to.equal(ORG_PARTY);
    });

    it('ORG-04: khoá tổ chức đã duyệt thì tổ chức mất role nghiệp vụ', async () => {
      const { registry, admin, alice } = await networkHelpers.loadFixture(appliedFixture);
      await registry.connect(admin).approveOrganization(ORG_PARTY);
      const reasonHash = statusReasonHash('Vi phạm điều khoản');

      await expect(registry.connect(admin).disableOrganization(ORG_PARTY, reasonHash))
        .to.emit(registry, 'OrganizationDisabled')
        .withArgs(ORG_PARTY, reasonHash);
      expect((await registry.organization(ORG_PARTY)).status).to.equal(STATUS.DISABLED);
      expect(await registry.hasPartyRole(ORG_PARTY, MANUFACTURER_ROLE)).to.equal(false);
      expect(await registry.authorizedOrganizationOf(alice.address, MANUFACTURER_ROLE)).to.equal(
        ZeroHash,
      );
    });
  });

  describe('Phí và Treasury (ORG-06)', () => {
    it('deploy ghi sẵn phí 8 MON và ví Treasury qua event để Indexer chiếu', async () => {
      const { registry, treasury } = await networkHelpers.loadFixture(deployFixture);

      expect(await registry.feeOf(ORG_REGISTRATION)).to.equal(REGISTRATION_FEE);
      expect(await registry.treasury()).to.equal(treasury.address);
      await expect(registry.deploymentTransaction())
        .to.emit(registry, 'FeeUpdated')
        .withArgs(ORG_REGISTRATION, REGISTRATION_FEE, treasury.address);
      await expect(registry.deploymentTransaction())
        .to.emit(registry, 'TreasuryUpdated')
        .withArgs(ZeroAddress, treasury.address);
    });

    it('Admin đổi phí; đơn đang chờ giữ nguyên số phí đã nộp', async () => {
      const { registry, admin, alice, treasury } = await networkHelpers.loadFixture(appliedFixture);
      const newFee = parseEther('5');

      await expect(registry.connect(admin).setFee(ORG_REGISTRATION, newFee))
        .to.emit(registry, 'FeeUpdated')
        .withArgs(ORG_REGISTRATION, newFee, treasury.address);
      expect(await registry.feeOf(ORG_REGISTRATION)).to.equal(newFee);
      expect(await registry.escrowedFeeOf(ORG_PARTY)).to.equal(REGISTRATION_FEE);

      await expect(
        registry.connect(alice).setFee(ORG_REGISTRATION, 0n),
      ).to.be.revertedWithCustomError(registry, 'AccessControlUnauthorizedAccount');
      await expect(registry.connect(admin).setFee(id('UNKNOWN'), 1n))
        .to.be.revertedWithCustomError(registry, 'UnknownFeeAction')
        .withArgs(id('UNKNOWN'));
    });

    it('Admin đổi ví Treasury; phí của đơn được duyệt sau đó về ví mới', async () => {
      const { registry, admin, carol, treasury } = await networkHelpers.loadFixture(appliedFixture);

      await expect(registry.connect(admin).setTreasury(carol.address))
        .to.emit(registry, 'TreasuryUpdated')
        .withArgs(treasury.address, carol.address);
      await expect(registry.connect(admin).setTreasury(ZeroAddress)).to.be.revertedWithCustomError(
        registry,
        'ZeroAddress',
      );

      await expect(registry.connect(admin).approveOrganization(ORG_PARTY)).to.changeEtherBalances(
        ethers,
        [carol],
        [REGISTRATION_FEE],
      );
    });

    it('phí bằng 0: nộp đơn không kèm MON, không phát FeePaid hay FeeSettled', async () => {
      const { registry, authorizeApplication, admin, alice } =
        await networkHelpers.loadFixture(deployFixture);
      await registry.connect(admin).setFee(ORG_REGISTRATION, 0n);
      const app = await authorizeApplication();

      await expect(
        registry
          .connect(alice)
          .applyOrganization(app.partyId, app.role, app.profileHash, app.deadline, app.signature),
      ).not.to.emit(registry, 'FeePaid');
      await expect(registry.connect(admin).approveOrganization(ORG_PARTY)).not.to.emit(
        registry,
        'FeeSettled',
      );
    });
  });
});
