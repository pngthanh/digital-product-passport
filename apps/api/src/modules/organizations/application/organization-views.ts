import { Inject, Injectable } from '@nestjs/common';
import {
  type FeePolicySummary,
  type OrganizationSummary,
  partyIdFromUuid,
  toChecksumAddress,
} from '@dpp/shared';
import { IdentityDirectory } from '../../identity/index.js';
import { type OrganizationRecord, stageOf } from '../domain/organization.js';
import {
  FEE_LEDGER_REPOSITORY,
  type FeeLedgerRepository,
  type FeePaymentRecord,
  type FeePolicyRecord,
} from './ports/fee-ledger.repository.js';

/** Ghép dòng organizations với lịch sử phí và người đại diện thành dữ liệu trả cho Web. */
@Injectable()
export class OrganizationViews {
  constructor(
    @Inject(FEE_LEDGER_REPOSITORY) private readonly ledger: FeeLedgerRepository,
    private readonly identity: IdentityDirectory,
  ) {}

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
    feePayments: payments.map((payment) => ({
      amountWei: payment.amountWei.toString(),
      feeStatus: payment.feeStatus,
      payerAddress: toChecksumAddress(payment.payerAddress),
      paidTxHash: payment.paidTxHash,
      paidAt: payment.paidAt.toISOString(),
      settledTxHash: payment.settledTxHash,
      refundTxHash: payment.refundTxHash,
    })),
    refundableWei: refundable.toString(),
  };
}
