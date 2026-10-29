import {
  addWarrantyMonths,
  PRODUCT_CONTRACT_ROLE,
  partyIdFromUuid,
  SERVICE_CONTRACT_ROLE,
} from '@dpp/shared';
import { expect } from 'chai';
import { ZeroAddress, ZeroHash } from 'ethers';
import { network } from 'hardhat';
import { passportFixture, SHOP } from '../support/passport-fixture.js';

const connection = await network.create();
const { ethers, networkHelpers } = connection;
const deployFixture = passportFixture(connection);

const WARRANTY = { NONE: 0n, ACTIVE: 1n, SUSPENDED: 2n, EXPIRED: 3n } as const;
const PRODUCT = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000c1');

/** Fixture có thêm Dave đóng vai ProductPassport (PRODUCT_CONTRACT_ROLE) và contract dịch vụ M7. */
async function withRoles() {
  const fixture = await deployFixture();
  const { registry, admin, dave } = fixture;
  await registry.connect(admin).grantRole(PRODUCT_CONTRACT_ROLE, dave.address);
  await registry.connect(admin).grantRole(SERVICE_CONTRACT_ROLE, dave.address);
  return fixture;
}

async function harness() {
  return ethers.deployContract('VietnamCalendarHarness');
}

function seconds(date: Date): bigint {
  return BigInt(Math.floor(date.getTime() / 1000));
}

describe('WarrantyManager – bảo hành kích hoạt khi bán', () => {
  it('chỉ contract có PRODUCT_CONTRACT_ROLE (ProductPassport) kích hoạt được', async () => {
    const { warranty, alice } = await networkHelpers.loadFixture(deployFixture);

    await expect(warranty.connect(alice).activateWarranty(PRODUCT, SHOP, 12))
      .to.be.revertedWithCustomError(warranty, 'CallerNotAuthorized')
      .withArgs(alice.address);
  });

  it('số tháng 1–120, mỗi sản phẩm kích hoạt một lần', async () => {
    const { warranty, dave } = await networkHelpers.loadFixture(withRoles);

    for (const months of [0, 121]) {
      await expect(warranty.connect(dave).activateWarranty(PRODUCT, SHOP, months))
        .to.be.revertedWithCustomError(warranty, 'InvalidWarrantyMonths')
        .withArgs(BigInt(months));
    }
    await expect(
      warranty.connect(dave).activateWarranty(ZeroHash, SHOP, 12),
    ).to.be.revertedWithCustomError(warranty, 'ZeroBytes32');
    await warranty.connect(dave).activateWarranty(PRODUCT, SHOP, 12);
    await expect(warranty.connect(dave).activateWarranty(PRODUCT, SHOP, 12))
      .to.be.revertedWithCustomError(warranty, 'WarrantyAlreadyActivated')
      .withArgs(PRODUCT);
  });

  it('hết hạn tự suy ra theo thời gian, không cần giao dịch (D10)', async () => {
    const { warranty, dave } = await networkHelpers.loadFixture(withRoles);
    await warranty.connect(dave).activateWarranty(PRODUCT, SHOP, 12);
    const { expiresAt } = await warranty.warrantyOf(PRODUCT);

    expect(await warranty.effectiveWarrantyState(PRODUCT)).to.equal(WARRANTY.ACTIVE);
    await networkHelpers.time.increaseTo(expiresAt - 1n);
    expect(await warranty.effectiveWarrantyState(PRODUCT)).to.equal(WARRANTY.ACTIVE);
    await networkHelpers.time.increaseTo(expiresAt);
    expect(await warranty.effectiveWarrantyState(PRODUCT)).to.equal(WARRANTY.EXPIRED);
    expect(await warranty.effectiveWarrantyState(ZeroHash)).to.equal(WARRANTY.NONE);
  });

  it('M7: contract dịch vụ tạm dừng và tiếp tục; đang dừng vẫn hết hạn theo thời gian', async () => {
    const { warranty, dave, alice } = await networkHelpers.loadFixture(withRoles);
    await warranty.connect(dave).activateWarranty(PRODUCT, SHOP, 12);

    await expect(warranty.connect(alice).suspendWarranty(PRODUCT)).to.be.revertedWithCustomError(
      warranty,
      'CallerNotAuthorized',
    );
    await expect(warranty.connect(dave).resumeWarranty(PRODUCT))
      .to.be.revertedWithCustomError(warranty, 'WarrantyNotSuspended')
      .withArgs(PRODUCT);
    await expect(warranty.connect(dave).suspendWarranty(PRODUCT))
      .to.emit(warranty, 'WarrantySuspended')
      .withArgs(PRODUCT);
    expect(await warranty.effectiveWarrantyState(PRODUCT)).to.equal(WARRANTY.SUSPENDED);
    await expect(warranty.connect(dave).resumeWarranty(PRODUCT))
      .to.emit(warranty, 'WarrantyResumed')
      .withArgs(PRODUCT);
    expect(await warranty.effectiveWarrantyState(PRODUCT)).to.equal(WARRANTY.ACTIVE);

    await warranty.connect(dave).suspendWarranty(PRODUCT);
    await networkHelpers.time.increaseTo((await warranty.warrantyOf(PRODUCT)).expiresAt);
    expect(await warranty.effectiveWarrantyState(PRODUCT)).to.equal(WARRANTY.EXPIRED);
    const other = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000c2');
    await expect(warranty.connect(dave).suspendWarranty(other))
      .to.be.revertedWithCustomError(warranty, 'WarrantyNotActive')
      .withArgs(other);
  });

  it('không deploy với địa chỉ PartyRegistry rỗng', async () => {
    const factory = await ethers.getContractFactory('WarrantyManager');

    await expect(
      ethers.deployContract('WarrantyManager', [ZeroAddress]),
    ).to.be.revertedWithCustomError(factory, 'ZeroAddress');
  });
});

describe('VietnamCalendar – hạn bảo hành theo lịch Việt Nam (UTC+7)', () => {
  it('giữ nguyên ngày và giờ theo giờ Việt Nam; ngày cuối tháng thì lấy ngày cuối tháng đích', async () => {
    const calendar = await networkHelpers.loadFixture(harness);
    // 15/10/2026 09:30 giờ Việt Nam + 24 tháng = 15/10/2028 09:30.
    expect(await calendar.addMonths(seconds(new Date('2026-10-15T02:30:00Z')), 24)).to.equal(
      seconds(new Date('2028-10-15T02:30:00Z')),
    );
    // 31/01/2027 + 1 tháng = 28/02/2027; 31/01/2028 (năm nhuận) + 1 tháng = 29/02/2028.
    expect(await calendar.addMonths(seconds(new Date('2027-01-31T03:00:00Z')), 1)).to.equal(
      seconds(new Date('2027-02-28T03:00:00Z')),
    );
    expect(await calendar.addMonths(seconds(new Date('2028-01-31T03:00:00Z')), 1)).to.equal(
      seconds(new Date('2028-02-29T03:00:00Z')),
    );
    // 23:30 ngày 31/12 giờ Việt Nam (16:30 UTC) vẫn tính là ngày 31/12.
    expect(await calendar.addMonths(seconds(new Date('2026-12-31T16:30:00Z')), 2)).to.equal(
      seconds(new Date('2027-02-28T16:30:00Z')),
    );
  });

  it('khớp addWarrantyMonths của @dpp/shared trên nhiều mốc thời gian', async () => {
    const calendar = await networkHelpers.loadFixture(harness);
    const start = Date.UTC(2026, 0, 1);
    const step = 37 * 3600 * 1000 + 17 * 60 * 1000 + 13 * 1000;
    for (let index = 0; index < 120; index += 1) {
      const from = new Date(start + index * step * 11);
      const months = (index % 120) + 1;
      expect(await calendar.addMonths(seconds(from), months), from.toISOString()).to.equal(
        seconds(addWarrantyMonths(from, months)),
      );
    }
  });
});
