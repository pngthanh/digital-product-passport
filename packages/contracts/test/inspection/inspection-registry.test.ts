import {
  encodeChainEnum,
  INSPECTION_RECORD_TYPES,
  type InspectionRecord,
  inspectionDomain,
  inspectionRecordDigest,
  INSPECTOR_ROLE,
  LIFECYCLE_CONTRACT_ROLE,
  partyIdFromUuid,
} from '@dpp/shared';
import { expect } from 'chai';
import { type BaseWallet, id, type Signer, Wallet, ZeroAddress, ZeroHash } from 'ethers';
import { network } from 'hardhat';
import {
  BUYER_PARTY,
  CAROL_PARTY,
  MAKER,
  passportFixture,
  SHOP,
  STATE,
} from '../support/passport-fixture.js';

const connection = await network.create();
const { ethers, networkHelpers } = connection;
const deployPassport = passportFixture(connection);

const DAVE_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000004');
const LAB = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000c4');
const OTHER_LAB = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000c5');
const INSPECTION = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000e1');
const INSPECTION_2 = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000e2');
const REPORT = id('bien ban kiem dinh an toan dien');
const RESULT = {
  PASS: encodeChainEnum('InspectionResult', 'PASS'),
  FAIL: encodeChainEnum('InspectionResult', 'FAIL'),
  CONDITIONAL: encodeChainEnum('InspectionResult', 'CONDITIONAL'),
} as const;

/**
 * Fixture M6 cộng thêm: Dave đại diện đơn vị kiểm định LAB, Carol đại diện OTHER_LAB (cả hai đã
 * duyệt), InspectionRegistry trỏ tới PartyRegistry và ProductPassport.
 */
async function deployInspection() {
  const fixture = await deployPassport();
  const { registry, passport, bob, carol, dave, registrar } = fixture;
  await fixture.registerUser(dave, DAVE_PARTY);
  await fixture.organization(dave, DAVE_PARTY, LAB, INSPECTOR_ROLE, true);
  await fixture.organization(carol, CAROL_PARTY, OTHER_LAB, INSPECTOR_ROLE, true);
  const inspections = await ethers.deployContract('InspectionRegistry', [
    await registry.getAddress(),
    await passport.getAddress(),
  ]);
  const domain = inspectionDomain(fixture.chainId, await inspections.getAddress());

  async function sold(serial = 'ABC-2026-000001'): Promise<string> {
    const productId = await fixture.atRetail(serial);
    await fixture.sell(bob, await fixture.authorizeSale({ productId }));
    return productId;
  }

  async function authorize(
    overrides: Partial<InspectionRecord> & Pick<InspectionRecord, 'productId'>,
    signer: BaseWallet = registrar,
  ): Promise<InspectionRecord & { signature: string }> {
    const permit: InspectionRecord = {
      inspectionId: INSPECTION,
      inspectorId: LAB,
      requesterId: MAKER,
      result: RESULT.PASS,
      reportHash: REPORT,
      deadline: await fixture.deadline(),
      ...overrides,
    };
    const signature = await signer.signTypedData(domain, INSPECTION_RECORD_TYPES, permit);
    return { ...permit, signature };
  }

  function record(wallet: Signer, permit: InspectionRecord & { signature: string }) {
    return inspections
      .connect(wallet)
      .recordInspection(
        permit.inspectionId,
        permit.productId,
        permit.requesterId,
        permit.result,
        permit.reportHash,
        permit.deadline,
        permit.signature,
      );
  }

  return { ...fixture, inspections, sold, authorize, record };
}

describe('InspectionRegistry – ghi kết quả kiểm định (INS-01)', () => {
  it('nhà sản xuất yêu cầu: đơn vị kiểm định ghi Đạt cho sản phẩm còn ở kho, phát event', async () => {
    const { inspections, passport, dave, registerOne, authorize, record } =
      await networkHelpers.loadFixture(deployInspection);
    const productId = await registerOne();

    await expect(record(dave, await authorize({ productId })))
      .to.emit(inspections, 'InspectionRecorded')
      .withArgs(INSPECTION, productId, LAB, MAKER, RESULT.PASS, REPORT);

    const stored = await inspections.inspection(INSPECTION);
    expect(stored.productId).to.equal(productId);
    expect(stored.inspectorId).to.equal(LAB);
    expect(stored.requesterId).to.equal(MAKER);
    expect(stored.reportHash).to.equal(REPORT);
    expect(stored.result).to.equal(BigInt(RESULT.PASS));
    expect(stored.inspectedAt).to.be.greaterThan(0n);
    expect(await inspections.latestInspectionOf(productId)).to.equal(INSPECTION);
    expect(await passport.stateOf(productId)).to.equal(STATE.CREATED);
  });

  it('chủ sở hữu yêu cầu sau khi mua: Không đạt chỉ được ghi nhận, sản phẩm vẫn SOLD', async () => {
    const { inspections, passport, dave, sold, authorize, record } =
      await networkHelpers.loadFixture(deployInspection);
    const productId = await sold();

    await expect(
      record(dave, await authorize({ productId, requesterId: BUYER_PARTY, result: RESULT.FAIL })),
    )
      .to.emit(inspections, 'InspectionRecorded')
      .withArgs(INSPECTION, productId, LAB, BUYER_PARTY, RESULT.FAIL, REPORT);
    expect(await passport.stateOf(productId)).to.equal(STATE.SOLD);
  });

  it('nhà sản xuất gửi được ở mọi trạng thái còn hoạt động, kể cả đang giao và đã bán', async () => {
    const { inspections, passport, alice, dave, registerOne, sold, authorize, record } =
      await networkHelpers.loadFixture(deployInspection);
    const shipping = await registerOne('ABC-2026-000002');
    await passport.connect(alice).dispatchCustody(shipping, SHOP);
    const owned = await sold('ABC-2026-000003');

    await record(dave, await authorize({ productId: shipping, result: RESULT.CONDITIONAL }));
    await record(dave, await authorize({ productId: owned, inspectionId: INSPECTION_2 }));
    expect((await inspections.inspection(INSPECTION)).result).to.equal(BigInt(RESULT.CONDITIONAL));
    expect(await inspections.latestInspectionOf(owned)).to.equal(INSPECTION_2);
  });

  it('người yêu cầu phải là nhà phát hành, hoặc chủ sở hữu khi đã bán', async () => {
    const { inspections, dave, atRetail, sold, authorize, record } =
      await networkHelpers.loadFixture(deployInspection);
    const unsold = await atRetail('ABC-2026-000002');
    const owned = await sold('ABC-2026-000003');

    // Người mua chưa sở hữu sản phẩm đang ở cửa hàng; nhà bán lẻ cũng không được yêu cầu.
    await expect(record(dave, await authorize({ productId: unsold, requesterId: BUYER_PARTY })))
      .to.be.revertedWithCustomError(inspections, 'RequesterNotAllowed')
      .withArgs(unsold, BUYER_PARTY);
    await expect(record(dave, await authorize({ productId: unsold, requesterId: SHOP })))
      .to.be.revertedWithCustomError(inspections, 'RequesterNotAllowed')
      .withArgs(unsold, SHOP);
    await expect(record(dave, await authorize({ productId: owned, requesterId: CAROL_PARTY })))
      .to.be.revertedWithCustomError(inspections, 'RequesterNotAllowed')
      .withArgs(owned, CAROL_PARTY);
  });

  it('chỉ ví đại diện đơn vị kiểm định đã duyệt mới ghi được', async () => {
    const { inspections, alice, bob, registerOne, authorize, record } =
      await networkHelpers.loadFixture(deployInspection);
    const productId = await registerOne();
    const permit = await authorize({ productId });

    for (const wallet of [alice, bob]) {
      await expect(record(wallet, permit))
        .to.be.revertedWithCustomError(inspections, 'NotAuthorizedInspector')
        .withArgs(wallet.address);
    }
  });

  it('giấy phép khoá đơn vị kiểm định, kết quả và hash biên bản; phải do registrar ký, còn hạn', async () => {
    const { inspections, carol, dave, registerOne, authorize, record } =
      await networkHelpers.loadFixture(deployInspection);
    const productId = await registerOne();
    const permit = await authorize({ productId });

    await expect(
      record(dave, await authorize({ productId }, Wallet.createRandom())),
    ).to.be.revertedWithCustomError(inspections, 'InvalidAuthorization');
    // Đơn vị khác dùng giấy phép cấp cho LAB.
    await expect(record(carol, permit)).to.be.revertedWithCustomError(
      inspections,
      'InvalidAuthorization',
    );
    // Đổi kết quả hoặc hash biên bản so với lúc máy chủ lưu.
    await expect(record(dave, { ...permit, result: RESULT.FAIL })).to.be.revertedWithCustomError(
      inspections,
      'InvalidAuthorization',
    );
    await expect(
      record(dave, { ...permit, reportHash: id('bien ban khac') }),
    ).to.be.revertedWithCustomError(inspections, 'InvalidAuthorization');
    await networkHelpers.time.increaseTo(permit.deadline + 1n);
    await expect(record(dave, permit))
      .to.be.revertedWithCustomError(inspections, 'AuthorizationExpired')
      .withArgs(permit.deadline);
  });

  it('mỗi inspectionId chỉ ghi một lần (giấy phép không dùng lại được)', async () => {
    const { inspections, dave, registerOne, authorize, record } =
      await networkHelpers.loadFixture(deployInspection);
    const productId = await registerOne();
    const permit = await authorize({ productId });
    await record(dave, permit);

    await expect(record(dave, permit))
      .to.be.revertedWithCustomError(inspections, 'InspectionAlreadyRecorded')
      .withArgs(INSPECTION);
  });

  it('không ghi cho sản phẩm chưa đăng ký hoặc đã thu hồi', async () => {
    const { inspections, passport, registry, admin, dave, registerOne, authorize, record } =
      await networkHelpers.loadFixture(deployInspection);
    const unknown = id('san pham chua dang ky');
    await expect(record(dave, await authorize({ productId: unknown })))
      .to.be.revertedWithCustomError(inspections, 'ProductNotInspectable')
      .withArgs(unknown, STATE.NONE);

    const recalled = await registerOne();
    await registry.connect(admin).grantRole(LIFECYCLE_CONTRACT_ROLE, admin.address);
    await passport.connect(admin).setLifecycleState(recalled, STATE.RECALLED);
    await expect(record(dave, await authorize({ productId: recalled })))
      .to.be.revertedWithCustomError(inspections, 'ProductNotInspectable')
      .withArgs(recalled, STATE.RECALLED);
  });

  it('từ chối kết quả NONE, giá trị 0 và địa chỉ 0 khi deploy', async () => {
    const { inspections, registry, dave, registerOne, authorize, record } =
      await networkHelpers.loadFixture(deployInspection);
    const productId = await registerOne();

    await expect(
      record(dave, await authorize({ productId, result: 0 })),
    ).to.be.revertedWithCustomError(inspections, 'InvalidInspectionResult');
    await expect(
      record(dave, await authorize({ productId, reportHash: ZeroHash })),
    ).to.be.revertedWithCustomError(inspections, 'ZeroBytes32');
    await expect(
      ethers.deployContract('InspectionRegistry', [await registry.getAddress(), ZeroAddress]),
    ).to.be.revertedWithCustomError(inspections, 'ZeroAddress');
  });

  it('digest của contract khớp hàm tính ở @dpp/shared', async () => {
    const { inspections, chainId } = await networkHelpers.loadFixture(deployInspection);
    const permit: InspectionRecord = {
      inspectionId: INSPECTION,
      productId: id('san pham'),
      inspectorId: LAB,
      requesterId: BUYER_PARTY,
      result: RESULT.CONDITIONAL,
      reportHash: REPORT,
      deadline: 123n,
    };

    expect(
      await inspections.inspectionRecordDigest(
        permit.inspectionId,
        permit.productId,
        permit.inspectorId,
        permit.requesterId,
        permit.result,
        permit.reportHash,
        permit.deadline,
      ),
    ).to.equal(inspectionRecordDigest(chainId, await inspections.getAddress(), permit));
  });
});
