import { FEE_ACTION_IDS, MANUFACTURER_ROLE, partyIdFromUuid, statusReasonHash } from '@dpp/shared';
import { recordingAudit } from '../../../../test/support/identity-fakes.js';
import {
  InMemoryFeeLedger,
  InMemoryOrganizations,
} from '../../../../test/support/organization-fakes.js';
import { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import type { ChainEvent } from '../../chain-sync/index.js';
import { OrganizationRegistryProjector } from './organization-registry.projector.js';

const scope = new TransactionScope({});
const PAYER = '0x1111111111111111111111111111111111111111';
const TREASURY = '0x2222222222222222222222222222222222222222';
const FEE = '8000000000000000000';
const PROFILE = '0x' + 'aa'.repeat(32);
let txCounter = 0;

function event(eventName: string, args: ChainEvent['args']): ChainEvent {
  txCounter += 1;
  return {
    chainId: 31337,
    contractName: 'PartyRegistry',
    contractAddress: '0x5fbdb2315678afecb367f032d93f642f64180aa3',
    eventName,
    args,
    blockNumber: BigInt(100 + txCounter),
    blockHash: '0x' + 'cd'.repeat(32),
    blockTimestamp: new Date('2026-10-29T09:00:00Z'),
    txHash: `0x${txCounter.toString(16).padStart(64, '0')}`,
    txIndex: 0,
    logIndex: 0,
    actorAddress: PAYER,
    correlationKey: typeof args.partyId === 'string' ? args.partyId : null,
  };
}

async function setup() {
  const organizations = new InMemoryOrganizations();
  const ledger = new InMemoryFeeLedger();
  const { audit, writer } = recordingAudit();
  const draft = await organizations.createDraft({
    representativeUserId: 'user-1',
    name: 'ABC Electronics',
    taxCode: '0312345678',
    orgType: 'MANUFACTURER',
    contactEmail: 'lien.he@abc.vn',
    contactPhone: null,
    address: null,
    profileHash: PROFILE,
  });
  const partyId = partyIdFromUuid(draft.id);
  const projector = new OrganizationRegistryProjector(organizations, ledger, audit);
  const applied = async () => {
    await projector.project(
      event('OrganizationApplied', {
        partyId,
        representativeId: '0x' + '01'.repeat(32),
        role: MANUFACTURER_ROLE.toLowerCase(),
        profileHash: PROFILE,
      }),
      scope,
    );
    await projector.project(
      event('FeePaid', {
        partyId,
        action: FEE_ACTION_IDS.ORG_REGISTRATION,
        payer: PAYER,
        amount: FEE,
      }),
      scope,
    );
  };
  return { organizations, ledger, writer, projector, draft, partyId, applied };
}

describe('Projector tổ chức và phí (Worker)', () => {
  it('OrganizationApplied + FeePaid: đơn chuyển sang chờ duyệt, phí ESCROWED', async () => {
    const { organizations, ledger, writer, applied, draft } = await setup();

    await applied();

    expect(organizations.only()).toMatchObject({
      authStatus: 'PENDING',
      appliedAt: new Date('2026-10-29T09:00:00Z'),
    });
    expect(ledger.payments[0]).toMatchObject({
      partyId: draft.id,
      amountWei: 8_000_000_000_000_000_000n,
      payerAddress: PAYER,
      feeStatus: 'ESCROWED',
    });
    expect(writer.actions()).toEqual(['ORG_APPLIED']);
  });

  it('duyệt: AUTHORIZED và phí SETTLED', async () => {
    const { organizations, ledger, projector, applied, partyId, draft } = await setup();
    await applied();

    await projector.project(
      event('OrganizationApproved', { partyId, role: MANUFACTURER_ROLE }),
      scope,
    );
    await projector.project(
      event('FeeSettled', { partyId, treasury: TREASURY, amount: FEE }),
      scope,
    );

    expect(organizations.only().authStatus).toBe('AUTHORIZED');
    expect(ledger.statuses(draft.id)).toEqual(['SETTLED']);
  });

  it('từ chối: REJECTED, phí REFUNDABLE; rút về ví thì REFUNDED; nộp lại xoá lý do cũ', async () => {
    const { organizations, ledger, projector, applied, partyId, draft } = await setup();
    await applied();
    await organizations.saveStatusReason(draft.id, 'Thiếu thông tin');

    await projector.project(
      event('OrganizationRejected', { partyId, reasonHash: statusReasonHash('Thiếu thông tin') }),
      scope,
    );
    expect(organizations.only()).toMatchObject({
      authStatus: 'REJECTED',
      statusReason: 'Thiếu thông tin',
    });
    expect(ledger.statuses(draft.id)).toEqual(['REFUNDABLE']);

    await applied();
    expect(organizations.only()).toMatchObject({ authStatus: 'PENDING', statusReason: null });

    await projector.project(
      event('FeeRefunded', { partyId, recipient: PAYER, amount: FEE }),
      scope,
    );
    expect(ledger.statuses(draft.id)).toEqual(['REFUNDED', 'ESCROWED']);
  });

  it('FeeUpdated, TreasuryUpdated cập nhật fee_policies', async () => {
    const { ledger, projector } = await setup();

    await projector.project(
      event('FeeUpdated', {
        action: FEE_ACTION_IDS.ORG_REGISTRATION,
        amount: FEE,
        treasury: TREASURY,
      }),
      scope,
    );
    await projector.project(
      event('TreasuryUpdated', { previousTreasury: TREASURY, newTreasury: PAYER }),
      scope,
    );

    expect(await ledger.findPolicy('ORG_REGISTRATION')).toMatchObject({
      amountWei: 8_000_000_000_000_000_000n,
      treasury: PAYER,
    });
  });

  it('bỏ qua event của tổ chức không có trong CSDL', async () => {
    const { organizations, projector } = await setup();

    await projector.project(
      event('OrganizationApproved', {
        partyId: partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000ff'),
        role: MANUFACTURER_ROLE,
      }),
      scope,
    );

    expect(organizations.only().authStatus).toBe('PENDING');
  });
});
