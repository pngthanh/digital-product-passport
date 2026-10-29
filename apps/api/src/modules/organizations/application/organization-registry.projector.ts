import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  feeActionFromId,
  orgTypeFromRole,
  PARTY_REGISTRY_CONTRACT_NAME,
  statusReasonHash,
  uuidFromPartyId,
} from '@dpp/shared';
import type { TransactionScope } from '../../../common/persistence/transaction-scope.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import type { ChainEvent, EventProjector } from '../../chain-sync/index.js';
import type { OrganizationRecord } from '../domain/organization.js';
import { reasonMatchesChain } from '../domain/organization-application.js';
import { FEE_LEDGER_REPOSITORY, type FeeLedgerRepository } from './ports/fee-ledger.repository.js';
import {
  ORGANIZATION_APPLICATION_REPOSITORY,
  type OrganizationApplicationRepository,
  type RoundDecision,
} from './ports/organization-application.repository.js';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
  type StatusProjection,
} from './ports/organization.repository.js';

const ORGANIZATION_EVENTS = [
  'OrganizationApplied',
  'OrganizationApproved',
  'OrganizationRejected',
  'OrganizationDisabled',
  'FeePaid',
  'FeeSettled',
  'FeeRefunded',
] as const;

const POLICY_EVENTS = ['FeeUpdated', 'TreasuryUpdated'] as const;

/**
 * Chiếu event finalized về tổ chức và phí của PartyRegistry sang organizations (cột [P]),
 * organization_applications, fee_payments và fee_policies. On-chain là nguồn sự thật.
 */
@Injectable()
export class OrganizationRegistryProjector implements EventProjector {
  readonly contractName = PARTY_REGISTRY_CONTRACT_NAME;
  readonly eventNames = [...ORGANIZATION_EVENTS, ...POLICY_EVENTS] as const;
  private readonly logger = new Logger(OrganizationRegistryProjector.name);

  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    @Inject(FEE_LEDGER_REPOSITORY) private readonly ledger: FeeLedgerRepository,
    @Inject(ORGANIZATION_APPLICATION_REPOSITORY)
    private readonly applications: OrganizationApplicationRepository,
    private readonly audit: AuditTrail,
  ) {}

  async project(event: ChainEvent, scope: TransactionScope): Promise<void> {
    if (event.eventName === 'FeeUpdated') {
      await this.projectFeeUpdated(event, scope);
      return;
    }
    if (event.eventName === 'TreasuryUpdated') {
      await this.ledger.updateTreasury(stringArg(event, 'newTreasury'), event.txHash, scope);
      return;
    }
    const organization = await this.organizationOf(event);
    if (!organization) {
      return;
    }
    switch (event.eventName) {
      case 'OrganizationApplied':
        await this.projectApplied(organization, event, scope);
        return;
      case 'OrganizationApproved':
        await this.decideRound(organization, event, { status: 'AUTHORIZED' }, scope);
        await this.projectStatus(
          organization,
          event,
          { status: 'AUTHORIZED', at: event.blockTimestamp },
          scope,
        );
        return;
      case 'OrganizationRejected':
        await this.decideRound(
          organization,
          event,
          { status: 'REJECTED', reasonHash: stringArg(event, 'reasonHash') },
          scope,
        );
        await this.projectStatus(
          organization,
          event,
          { status: 'REJECTED', at: event.blockTimestamp },
          scope,
        );
        await this.ledger.markRefundable(organization.id, scope);
        return;
      case 'OrganizationDisabled':
        this.checkDisableReason(organization, event);
        await this.projectStatus(
          organization,
          event,
          { status: 'DISABLED', at: event.blockTimestamp },
          scope,
        );
        return;
      case 'FeePaid':
        await this.projectFeePaid(organization, event, scope);
        return;
      case 'FeeSettled':
        await this.ledger.settle(organization.id, event.txHash, event.blockTimestamp, scope);
        return;
      case 'FeeRefunded':
        await this.ledger.markRefunded(organization.id, event.txHash, event.blockTimestamp, scope);
        await this.record(AuditAction.ORG_FEE_REFUNDED, organization, event, scope, {
          amountWei: stringArg(event, 'amount'),
        });
        return;
      default:
        this.logger.warn(`Không có cách chiếu event ${event.eventName}`);
    }
  }

  private async projectApplied(
    organization: OrganizationRecord,
    event: ChainEvent,
    scope: TransactionScope,
  ): Promise<void> {
    const orgType = orgTypeFromRole(stringArg(event, 'role'));
    if (!orgType) {
      this.logger.warn(`OrganizationApplied với role lạ (tx ${event.txHash})`);
      return;
    }
    const profileHash = stringArg(event, 'profileHash');
    const snapshotMatches = organization.profileHash === profileHash;
    if (!snapshotMatches) {
      this.logger.warn(
        `Hồ sơ ${organization.id} trong CSDL khác hash đã nộp on-chain (tx ${event.txHash})`,
      );
    }
    await this.applications.recordApplied(
      {
        organizationId: organization.id,
        orgType,
        // Chỉ lưu bản chụp khi hồ sơ trong CSDL đúng là hồ sơ đã băm và nộp on-chain.
        profile: snapshotMatches
          ? {
              name: organization.name,
              taxCode: organization.taxCode,
              orgType,
              contactEmail: organization.contactEmail,
              contactPhone: organization.contactPhone,
              address: organization.address,
            }
          : null,
        profileHash,
        applicantAddress: requireActor(event),
        txHash: event.txHash,
        appliedAt: event.blockTimestamp,
      },
      scope,
    );
    await this.projectStatus(
      organization,
      event,
      { status: 'PENDING', at: event.blockTimestamp, profileHash, orgType },
      scope,
    );
  }

  private async projectStatus(
    organization: OrganizationRecord,
    event: ChainEvent,
    projection: StatusProjection,
    scope: TransactionScope,
  ): Promise<void> {
    await this.organizations.applyStatus(organization.id, projection, scope);
    const action = {
      PENDING: AuditAction.ORG_APPLIED,
      AUTHORIZED: AuditAction.ORG_APPROVED,
      REJECTED: AuditAction.ORG_REJECTED,
      DISABLED: AuditAction.ORG_DISABLED,
    }[projection.status];
    await this.record(action, organization, event, scope);
  }

  private async projectFeePaid(
    organization: OrganizationRecord,
    event: ChainEvent,
    scope: TransactionScope,
  ): Promise<void> {
    const action = feeActionFromId(stringArg(event, 'action'));
    if (!action) {
      this.logger.warn(`FeePaid với mã thao tác lạ (tx ${event.txHash})`);
      return;
    }
    const paymentId = await this.ledger.recordPaid(
      {
        partyId: organization.id,
        action,
        payerAddress: stringArg(event, 'payer'),
        amountWei: BigInt(stringArg(event, 'amount')),
        txHash: event.txHash,
        paidAt: event.blockTimestamp,
      },
      scope,
    );
    // FeePaid phát cùng giao dịch, ngay sau OrganizationApplied.
    await this.applications.attachFee(event.txHash, paymentId, scope);
  }

  private async decideRound(
    organization: OrganizationRecord,
    event: ChainEvent,
    decision:
      | Pick<Extract<RoundDecision, { status: 'AUTHORIZED' }>, 'status'>
      | Pick<Extract<RoundDecision, { status: 'REJECTED' }>, 'status' | 'reasonHash'>,
    scope: TransactionScope,
  ): Promise<void> {
    const decided = await this.applications.decide(
      organization.id,
      {
        ...decision,
        decidedBy: requireActor(event),
        txHash: event.txHash,
        at: event.blockTimestamp,
      },
      scope,
    );
    if (!decided) {
      this.logger.warn(`${event.eventName} nhưng tổ chức ${organization.id} không có đơn đang chờ`);
    } else if (decided.status === 'REJECTED' && reasonMatchesChain(decided) !== true) {
      this.logger.warn(`Lý do từ chối trong CSDL không khớp hash on-chain (tx ${event.txHash})`);
    }
  }

  private async projectFeeUpdated(event: ChainEvent, scope: TransactionScope): Promise<void> {
    const action = feeActionFromId(stringArg(event, 'action'));
    if (!action) {
      this.logger.warn(`FeeUpdated với mã thao tác lạ (tx ${event.txHash})`);
      return;
    }
    const amountWei = BigInt(stringArg(event, 'amount'));
    await this.ledger.upsertPolicy(
      { action, amountWei, treasury: stringArg(event, 'treasury') },
      event.txHash,
      scope,
    );
    await this.audit.record(
      {
        action: AuditAction.FEE_POLICY_UPDATED,
        actorUserId: null,
        targetType: 'fee_policy',
        targetId: action,
        metadata: { amountWei: amountWei.toString(), txHash: event.txHash },
      },
      scope,
    );
  }

  private async organizationOf(event: ChainEvent): Promise<OrganizationRecord | null> {
    const chainPartyId = stringArg(event, 'partyId');
    let id: string;
    try {
      id = uuidFromPartyId(chainPartyId);
    } catch {
      this.logger.warn(`Bỏ qua ${event.eventName}: partyId ${chainPartyId} không do hệ thống cấp`);
      return null;
    }
    const organization = await this.organizations.findById(id);
    if (!organization) {
      this.logger.warn(`${event.eventName} của tổ chức chưa có trong CSDL (tx ${event.txHash})`);
    }
    return organization;
  }

  /** Lý do khoá lưu ở CSDL phải khớp hash Admin gửi on-chain; lệch thì chỉ cảnh báo, on-chain vẫn là chuẩn. */
  private checkDisableReason(organization: OrganizationRecord, event: ChainEvent): void {
    const reasonHash = stringArg(event, 'reasonHash');
    if (!organization.statusReason || statusReasonHash(organization.statusReason) !== reasonHash) {
      this.logger.warn(
        `Lý do ${event.eventName} trong CSDL không khớp hash on-chain (tx ${event.txHash})`,
      );
    }
  }

  private async record(
    action: AuditAction,
    organization: OrganizationRecord,
    event: ChainEvent,
    scope: TransactionScope,
    extra: Record<string, string> = {},
  ): Promise<void> {
    await this.audit.record(
      {
        action,
        actorUserId:
          action === AuditAction.ORG_APPLIED || action === AuditAction.ORG_FEE_REFUNDED
            ? organization.representativeUserId
            : null,
        targetType: 'organization',
        targetId: organization.id,
        metadata: {
          txHash: event.txHash,
          blockNumber: event.blockNumber.toString(),
          actorAddress: event.actorAddress,
          ...extra,
        },
      },
      scope,
    );
  }
}

/** Ví gửi giao dịch; thiếu (RPC chưa trả giao dịch) thì báo lỗi để Indexer chiếu lại ở vòng sau. */
function requireActor(event: ChainEvent): string {
  if (!event.actorAddress) {
    throw new Error(`Chưa đọc được ví gửi giao dịch ${event.txHash}, chiếu lại ở vòng sau`);
  }
  return event.actorAddress;
}

function stringArg(event: ChainEvent, name: string): string {
  const value = event.args[name];
  if (typeof value !== 'string') {
    throw new Error(`Event ${event.eventName} thiếu tham số ${name}`);
  }
  return value;
}
