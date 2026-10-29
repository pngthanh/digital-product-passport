import {
  MANUFACTURER_ROLE,
  ORGANIZATION_APPLICATION_TYPES,
  type OrganizationApplicationInput,
  organizationProfileHash,
  partyIdFromUuid,
  partyRegistryDomain,
  RETAILER_ROLE,
  statusReasonHash,
} from '@dpp/shared';
import { verifyTypedData, Wallet } from 'ethers';
import { inMemoryChainHistory } from '../../../../test/support/chain-sync-fakes.js';
import { InMemoryIdentityStore, recordingAudit } from '../../../../test/support/identity-fakes.js';
import {
  FakeOrganizationChain,
  InMemoryFeeLedger,
  InMemoryOrganizationApplications,
  InMemoryOrganizations,
} from '../../../../test/support/organization-fakes.js';
import { TEST_REGISTRAR_KEY, TestClock } from '../../../../test/support/test-config.js';
import {
  TransactionScope,
  type UnitOfWork,
} from '../../../common/persistence/transaction-scope.js';
import { IdentityDirectory } from '../../identity/application/identity-directory.service.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import {
  ApplicationLockedError,
  ChainReadFailedError,
  DecisionNotAllowedError,
  OrganizationChainNotConfiguredError,
  PersonalWalletRequiredError,
  TaxCodeTakenError,
} from '../domain/organizations.errors.js';
import { GetMyOrganization } from './get-my-organization.query.js';
import { OrganizationViews } from './organization-views.js';
import { PrepareAdminDecision } from './prepare-admin-decision.use-case.js';
import { SubmitOrganizationApplication } from './submit-organization-application.use-case.js';

const WALLET = '0x1111111111111111111111111111111111111111';
const ADMIN_WALLET = '0x2222222222222222222222222222222222222222';
const client = { ipAddress: '127.0.0.1', userAgent: 'vitest' };
const passthrough: UnitOfWork = { run: (work) => work(new TransactionScope({})) };

const INPUT: OrganizationApplicationInput = {
  name: '  ABC   Electronics ',
  taxCode: '0312345678',
  orgType: 'MANUFACTURER',
  contactEmail: 'Lien.He@ABC.vn',
  contactPhone: '028 3812 3456',
  address: null,
};

async function setup() {
  const store = new InMemoryIdentityStore();
  const organizations = new InMemoryOrganizations();
  const ledger = new InMemoryFeeLedger();
  const applications = new InMemoryOrganizationApplications();
  const chain = new FakeOrganizationChain();
  const { audit, writer } = recordingAudit();
  const identity = new IdentityDirectory(store, store);
  const views = new OrganizationViews(ledger, applications, identity, inMemoryChainHistory());

  async function account(email: string, wallet: string | null): Promise<AuthenticatedUser> {
    const { account: created } = await store.createWithParty({
      email,
      passwordHash: 'x',
      fullName: email.split('@')[0] ?? email,
    });
    if (wallet) {
      store.seedWallet(created.id, wallet, 'ACTIVE');
      const party = store.partyOfUser(created.id);
      party.chainPartyId = partyIdFromUuid(party.id);
    }
    return { id: created.id, email, fullName: created.fullName, systemRole: 'USER' };
  }

  const representative = await account('dai.dien@abc.vn', WALLET);
  return {
    store,
    organizations,
    ledger,
    applications,
    chain,
    writer,
    account,
    representative,
    submit: new SubmitOrganizationApplication(
      organizations,
      chain,
      passthrough,
      new TestClock(),
      identity,
      audit,
    ),
    getMine: new GetMyOrganization(organizations, chain, views),
    decide: new PrepareAdminDecision(organizations, chain, applications, identity, audit),
  };
}

describe('ORG-01 Nộp đơn đăng ký doanh nghiệp', () => {
  it('lưu hồ sơ chuẩn hoá, tạo Party tổ chức và cấp giấy phép cho đúng ví cá nhân', async () => {
    const { submit, organizations, store, chain, writer, representative } = await setup();

    const authorization = await submit.execute(representative, INPUT, client);

    const saved = organizations.only();
    expect(saved).toMatchObject({
      name: 'ABC Electronics',
      contactEmail: 'lien.he@abc.vn',
      contactPhone: '02838123456',
      representativeUserId: representative.id,
      authStatus: 'PENDING',
      appliedAt: null,
    });
    expect(store.organizationParties.has(saved.id)).toBe(true);
    expect(authorization).toMatchObject({
      organizationId: saved.id,
      method: 'applyOrganization',
      partyId: partyIdFromUuid(saved.id),
      representativeId: partyIdFromUuid(store.partyOfUser(representative.id).id),
      role: MANUFACTURER_ROLE,
      profileHash: organizationProfileHash(saved),
      feeWei: chain.fee.toString(),
      wallet: '0x1111111111111111111111111111111111111111',
    });

    const signer = verifyTypedData(
      partyRegistryDomain(chain.chainId, authorization.contractAddress),
      ORGANIZATION_APPLICATION_TYPES,
      { ...chain.signed[0] },
      authorization.signature,
    );
    expect(signer).toBe(new Wallet(TEST_REGISTRAR_KEY).address);
    expect(writer.actions()).toEqual(['ORG_APPLICATION_AUTHORIZED']);
  });

  it('bắt buộc đã liên kết ví MetaMask: mọi giao dịch doanh nghiệp do ví cá nhân ký', async () => {
    const { submit, account } = await setup();
    const noWallet = await account('chua.co.vi@abc.vn', null);

    await expect(submit.execute(noWallet, INPUT, client)).rejects.toBeInstanceOf(
      PersonalWalletRequiredError,
    );
  });

  it('nộp lại khi còn là bản nháp thì sửa đúng đơn cũ, không tạo tổ chức mới', async () => {
    const { submit, organizations, representative } = await setup();
    await submit.execute(representative, INPUT, client);

    const second = await submit.execute(
      representative,
      { ...INPUT, orgType: 'RETAILER', name: 'ABC Store' },
      client,
    );

    expect(organizations.rows.size).toBe(1);
    expect(organizations.only().name).toBe('ABC Store');
    expect(second.role).toBe(RETAILER_ROLE);
  });

  it('mã số thuế đã thuộc doanh nghiệp khác thì báo trùng', async () => {
    const { submit, account, representative } = await setup();
    await submit.execute(representative, INPUT, client);
    const other = await account('khac@xyz.vn', '0x3333333333333333333333333333333333333333');

    await expect(submit.execute(other, INPUT, client)).rejects.toBeInstanceOf(TaxCodeTakenError);
  });

  it('đơn đang chờ duyệt hoặc đã duyệt không sửa được; đơn bị từ chối thì sửa và nộp lại được', async () => {
    const { submit, organizations, representative } = await setup();
    await submit.execute(representative, INPUT, client);
    const { id } = organizations.only();

    await organizations.applyStatus(id, {
      status: 'PENDING',
      at: new Date(),
      profileHash: '0x' + 'aa'.repeat(32),
      orgType: 'MANUFACTURER',
    });
    await expect(submit.execute(representative, INPUT, client)).rejects.toBeInstanceOf(
      ApplicationLockedError,
    );

    await organizations.applyStatus(id, { status: 'REJECTED', at: new Date() });
    await expect(
      submit.execute(representative, { ...INPUT, name: 'ABC Electronics JSC' }, client),
    ).resolves.toMatchObject({ organizationId: id });
  });

  it('chưa cấu hình contract hoặc không đọc được phí thì báo rõ, không cấp giấy phép', async () => {
    const { submit, chain, representative } = await setup();

    chain.failing = true;
    await expect(submit.execute(representative, INPUT, client)).rejects.toBeInstanceOf(
      ChainReadFailedError,
    );

    chain.contractAddress = null;
    await expect(submit.execute(representative, INPUT, client)).rejects.toBeInstanceOf(
      OrganizationChainNotConfiguredError,
    );
  });

  it('trang Doanh nghiệp của tôi hiển thị bản nháp và phí hiện hành', async () => {
    const { submit, getMine, ledger, representative } = await setup();
    await ledger.upsertPolicy(
      { action: 'ORG_REGISTRATION', amountWei: 8n * 10n ** 18n, treasury: ADMIN_WALLET },
      '0x' + 'bb'.repeat(32),
    );
    await submit.execute(representative, INPUT, client);

    const view = await getMine.execute(representative);

    expect(view.organization).toMatchObject({ stage: 'DRAFT', refundableWei: '0' });
    expect(view.history).toEqual({ applications: [], chainLog: [] });
    expect(view.organization?.representative.email).toBe('dai.dien@abc.vn');
    expect(view.registrationFee).toMatchObject({ amountWei: '8000000000000000000' });
    expect(view.contract?.chainId).toBe(31337);
  });
});

describe('ORG-03, ORG-04 Admin chuẩn bị quyết định', () => {
  it('lưu lý do vào CSDL và vào đúng lần nộp đang chờ, trả hash để ví Admin gửi rejectOrganization', async () => {
    const { submit, decide, organizations, applications, account, representative } = await setup();
    await submit.execute(representative, INPUT, client);
    const { id } = organizations.only();
    await organizations.applyStatus(id, {
      status: 'PENDING',
      at: new Date(),
      profileHash: '0x' + 'aa'.repeat(32),
      orgType: 'MANUFACTURER',
    });
    await applications.recordApplied({
      organizationId: id,
      orgType: 'MANUFACTURER',
      profile: null,
      profileHash: '0x' + 'aa'.repeat(32),
      applicantAddress: WALLET,
      txHash: '0x' + '01'.repeat(32),
      appliedAt: new Date(),
    });
    const admin = {
      ...(await account('admin@dpp.vn', ADMIN_WALLET)),
      systemRole: 'ADMIN' as const,
    };

    const call = await decide.execute(admin, id, 'REJECT', '  Mã số thuế không khớp  ', client);

    expect(call).toMatchObject({
      method: 'rejectOrganization',
      partyId: partyIdFromUuid(id),
      reasonHash: statusReasonHash('Mã số thuế không khớp'),
      wallet: '0x2222222222222222222222222222222222222222',
    });
    expect(organizations.only().statusReason).toBe('Mã số thuế không khớp');
    expect((await applications.listFor(id))[0]?.decisionReason).toBe('Mã số thuế không khớp');
  });

  it('chỉ từ chối đơn đang chờ và chỉ khoá doanh nghiệp đã duyệt', async () => {
    const { submit, decide, organizations, account, representative } = await setup();
    await submit.execute(representative, INPUT, client);
    const { id } = organizations.only();
    const admin = await account('admin@dpp.vn', ADMIN_WALLET);

    await expect(decide.execute(admin, id, 'REJECT', 'Bản nháp', client)).rejects.toBeInstanceOf(
      DecisionNotAllowedError,
    );
    await expect(decide.execute(admin, id, 'DISABLE', 'Chưa duyệt', client)).rejects.toBeInstanceOf(
      DecisionNotAllowedError,
    );
  });
});
