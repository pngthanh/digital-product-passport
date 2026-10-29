import { Inject, Injectable } from '@nestjs/common';
import {
  type FeePaymentSummary,
  type FeePolicySummary,
  type OrganizationApplicationView,
  type OrganizationHistory,
  type OrganizationSummary,
  PARTY_REGISTRY_CONTRACT_NAME,
  partyIdFromUuid,
  toChecksumAddress,
} from '@dpp/shared';
import { ChainEventHistory, presentChainEvent } from '../../chain-sync/index.js';
import { IdentityDirectory } from '../../identity/index.js';
import { type OrganizationRecord, stageOf } from '../domain/organization.js';
import {
  type OrganizationApplicationRecord,
  profileMatchesChain,
  reasonMatchesChain,
} from '../domain/organization-application.js';
import {
  FEE_LEDGER_REPOSITORY,
  type FeeLedgerRepository,
  type FeePaymentRecord,
  type FeePolicyRecord,
} from './ports/fee-ledger.repository.js';
import {
  ORGANIZATION_APPLICATION_REPOSITORY,
  type OrganizationApplicationRepository,
} from './ports/organization-application.repository.js';

/** Ghép dòng organizations với lịch sử phí, các lần nộp đơn và người đại diện thành dữ liệu trả cho Web. */
@Injectable()
export class OrganizationViews {
  constructor(
    @Inject(FEE_LEDGER_REPOSITORY) private readonly ledger: FeeLedgerRepository,
    @Inject(ORGANIZATION_APPLICATION_REPOSITORY)
    private readonly applications: OrganizationApplicationRepository,
    private readonly identity: IdentityDirectory,
    private readonly chainHistory: ChainEventHistory,
  ) {}

  /** Mọi lần nộp đơn (mới nhất trước) và mọi event on-chain của Party tổ chức. */
  async history(record: OrganizationRecord): Promise<OrganizationHistory> {
    const [applications, payments, events] = await Promise.all([
      this.applications.listFor(record.id),
      this.ledger.paymentsOf([record.id]),
      this.chainHistory.ofCorrelation(PARTY_REGISTRY_CONTRACT_NAME, partyIdFromUuid(record.id)),
    ]);
    const paymentById = new Map(
      (payments.get(record.id) ?? []).map((payment) => [payment.id, payment]),
    );
    return {
      applications: applications.map((application) =>
        presentApplication(
          application,
          application.feePaymentId ? paymentById.get(application.feePaymentId) : undefined,
        ),
      ),
      chainLog: events.map(presentChainEvent),
    };
  }

  async summarize(records: readonly OrganizationRecord[]): Promise<OrganizationSummary[]> {
    const ids = records.map((record) => record.id);
    const [payments, representatives] = await Promise.all([
      this.ledger.paymentsOf(ids),
      this.identity.describeUsers(records.map((record) => record.representativeUserId)),
    ]);
    return records.map((record) => {
      const representative = representatives.get(record.representativeUserId);
      return toSummary(record, payments.get(record.id) ?? [], {
        userId: record.representativeUserId,
        fullName: representative?.fullName ?? '',
        email: representative?.email ?? '',
      });
    });
  }

  async registrationFee(): Promise<FeePolicySummary | null> {
    const policy = await this.ledger.findPolicy('ORG_REGISTRATION');
    return policy && presentPolicy(policy);
  }
}

export function presentPolicy(policy: FeePolicyRecord): FeePolicySummary {
  return {
    action: policy.action,
    amountWei: policy.amountWei.toString(),
    treasury: toChecksumAddress(policy.treasury),
  };
}

function presentPayment(payment: FeePaymentRecord): FeePaymentSummary {
  return {
    amountWei: payment.amountWei.toString(),
    feeStatus: payment.feeStatus,
    payerAddress: toChecksumAddress(payment.payerAddress),
    paidTxHash: payment.paidTxHash,
    paidAt: payment.paidAt.toISOString(),
    settledTxHash: payment.settledTxHash,
    refundTxHash: payment.refundTxHash,
  };
}

function presentApplication(
  application: OrganizationApplicationRecord,
  payment: FeePaymentRecord | undefined,
): OrganizationApplicationView {
  return {
    round: application.round,
    status: application.status,
    orgType: application.orgType,
    profile: application.profile,
    profileHash: application.profileHash,
    profileMatchesChain: profileMatchesChain(application),
    applicantAddress: toChecksumAddress(application.applicantAddress),
    appliedTxHash: application.appliedTxHash,
    appliedAt: application.appliedAt.toISOString(),
    fee: payment ? presentPayment(payment) : null,
    decisionReason: application.decisionReason,
    decisionReasonHash: application.decisionReasonHash,
    reasonMatchesChain: reasonMatchesChain(application),
    decidedByAddress: application.decidedByAddress
      ? toChecksumAddress(application.decidedByAddress)
      : null,
    decidedTxHash: application.decidedTxHash,
    decidedAt: application.decidedAt?.toISOString() ?? null,
  };
}

function toSummary(
  record: OrganizationRecord,
  payments: readonly FeePaymentRecord[],
  representative: OrganizationSummary['representative'],
): OrganizationSummary {
  const refundable = payments
    .filter((payment) => payment.feeStatus === 'REFUNDABLE')
    .reduce((sum, payment) => sum + payment.amountWei, 0n);
  return {
    id: record.id,
    // Party của tổ chức dùng chung UUID với dòng organizations (D25).
    partyId: partyIdFromUuid(record.id),
    name: record.name,
    taxCode: record.taxCode,
    orgType: record.orgType,
    contactEmail: record.contactEmail,
    contactPhone: record.contactPhone,
    address: record.address,
    profileHash: record.profileHash,
    stage: stageOf(record),
    statusReason: record.statusReason,
    appliedAt: record.appliedAt?.toISOString() ?? null,
    approvedAt: record.approvedAt?.toISOString() ?? null,
    rejectedAt: record.rejectedAt?.toISOString() ?? null,
    disabledAt: record.disabledAt?.toISOString() ?? null,
    representative,
    feePayments: payments.map(presentPayment),
    refundableWei: refundable.toString(),
  };
}
