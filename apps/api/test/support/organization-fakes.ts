import { randomUUID } from 'node:crypto';
import type { FeeAction, OrganizationApplication, OrganizationStage } from '@dpp/shared';
import { ORGANIZATION_APPLICATION_TYPES, partyRegistryDomain } from '@dpp/shared';
import { Wallet } from 'ethers';
import type {
  FeeLedgerRepository,
  FeePaymentRecord,
  FeePolicyRecord,
  PaidFee,
} from '../../src/modules/organizations/application/ports/fee-ledger.repository.js';
import type { OrganizationChain } from '../../src/modules/organizations/application/ports/organization-chain.port.js';
import type {
  DraftInput,
  OrganizationRepository,
  StatusProjection,
} from '../../src/modules/organizations/application/ports/organization.repository.js';
import {
  type OrganizationRecord,
  stageOf,
} from '../../src/modules/organizations/domain/organization.js';
import { TaxCodeTakenError } from '../../src/modules/organizations/domain/organizations.errors.js';
import { TEST_PARTY_REGISTRY, TEST_REGISTRAR_KEY } from './test-config.js';

/** Bảng organizations trong bộ nhớ, giữ UNIQUE(tax_code) và UNIQUE(representative_user_id). */
export class InMemoryOrganizations implements OrganizationRepository {
  readonly rows = new Map<string, OrganizationRecord>();

  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }

  async findByRepresentative(userId: string) {
    return [...this.rows.values()].find((row) => row.representativeUserId === userId) ?? null;
  }

  async findByTaxCode(taxCode: string) {
    return [...this.rows.values()].find((row) => row.taxCode === taxCode) ?? null;
  }

  async list(stages: readonly OrganizationStage[]) {
    return [...this.rows.values()].filter((row) =>
      stages.length > 0 ? stages.includes(stageOf(row)) : stageOf(row) !== 'DRAFT',
    );
  }

  async countByStage() {
    const counts = { DRAFT: 0, PENDING: 0, AUTHORIZED: 0, REJECTED: 0, DISABLED: 0 };
    for (const row of this.rows.values()) {
      counts[stageOf(row)] += 1;
    }
    return counts;
  }

  async createDraft(input: DraftInput) {
    this.assertTaxCodeFree(input.taxCode, null);
    const row: OrganizationRecord = {
      ...input,
      id: randomUUID(),
      authStatus: 'PENDING',
      statusReason: null,
      appliedAt: null,
      approvedAt: null,
      rejectedAt: null,
      disabledAt: null,
      createdAt: new Date('2026-10-29T08:00:00Z'),
    };
    this.rows.set(row.id, row);
    return row;
  }

  async updateProfile(id: string, input: DraftInput) {
    this.assertTaxCodeFree(input.taxCode, id);
    const row = { ...this.require(id), ...input };
    this.rows.set(id, row);
    return row;
  }

  async saveStatusReason(id: string, reason: string) {
    this.rows.set(id, { ...this.require(id), statusReason: reason });
  }

  async applyStatus(id: string, projection: StatusProjection) {
    const row = this.rows.get(id);
    if (!row) {
      return false;
    }
    const next: OrganizationRecord =
      projection.status === 'PENDING'
        ? {
            ...row,
            authStatus: 'PENDING',
            appliedAt: projection.at,
            profileHash: projection.profileHash,
            orgType: projection.orgType,
            statusReason: null,
          }
        : projection.status === 'AUTHORIZED'
          ? { ...row, authStatus: 'AUTHORIZED', approvedAt: projection.at }
          : projection.status === 'REJECTED'
            ? { ...row, authStatus: 'REJECTED', rejectedAt: projection.at }
            : { ...row, authStatus: 'DISABLED', disabledAt: projection.at };
    this.rows.set(id, next);
    return true;
  }

  only(): OrganizationRecord {
    const [row] = this.rows.values();
    if (!row) {
      throw new Error('Chưa có tổ chức nào');
    }
    return row;
  }

  private require(id: string): OrganizationRecord {
    const row = this.rows.get(id);
    if (!row) {
      throw new Error(`Không có tổ chức ${id}`);
    }
    return row;
  }

  private assertTaxCodeFree(taxCode: string, ownId: string | null) {
    const other = [...this.rows.values()].find((row) => row.taxCode === taxCode);
    if (other && other.id !== ownId) {
      throw new TaxCodeTakenError();
    }
  }
}

/** fee_payments và fee_policies trong bộ nhớ. */
export class InMemoryFeeLedger implements FeeLedgerRepository {
  readonly payments: FeePaymentRecord[] = [];
  readonly policies = new Map<FeeAction, FeePolicyRecord & { txHash: string }>();

  async findPolicy(action: FeeAction) {
    return this.policies.get(action) ?? null;
  }

  async paymentsOf(partyIds: readonly string[]) {
    const result = new Map<string, FeePaymentRecord[]>();
    for (const payment of this.payments.toReversed()) {
      if (partyIds.includes(payment.partyId)) {
        result.set(payment.partyId, [...(result.get(payment.partyId) ?? []), payment]);
      }
    }
    return result;
  }

  async recordPaid(fee: PaidFee) {
    if (this.payments.some((payment) => payment.paidTxHash === fee.txHash)) {
      return;
    }
    this.payments.push({
      partyId: fee.partyId,
      amountWei: fee.amountWei,
      feeStatus: 'ESCROWED',
      payerAddress: fee.payerAddress,
      paidTxHash: fee.txHash,
      paidAt: fee.paidAt,
      settledTxHash: null,
      refundTxHash: null,
    });
  }

  async settle(partyId: string, txHash: string) {
    this.update(partyId, 'ESCROWED', { feeStatus: 'SETTLED', settledTxHash: txHash });
  }

  async markRefundable(partyId: string) {
    this.update(partyId, 'ESCROWED', { feeStatus: 'REFUNDABLE' });
  }

  async markRefunded(partyId: string, txHash: string) {
    this.update(partyId, 'REFUNDABLE', { feeStatus: 'REFUNDED', refundTxHash: txHash });
  }

  async upsertPolicy(policy: FeePolicyRecord, txHash: string) {
    this.policies.set(policy.action, { ...policy, txHash });
  }

  async updateTreasury(treasury: string, txHash: string) {
    for (const [action, policy] of this.policies) {
      this.policies.set(action, { ...policy, treasury, txHash });
    }
  }

  statuses(partyId: string) {
    return this.payments
      .filter((payment) => payment.partyId === partyId)
      .map((payment) => payment.feeStatus);
  }

  private update(
    partyId: string,
    from: FeePaymentRecord['feeStatus'],
    patch: Partial<FeePaymentRecord>,
  ) {
    this.payments.forEach((payment, index) => {
      if (payment.partyId === partyId && payment.feeStatus === from) {
        this.payments[index] = { ...payment, ...patch };
      }
    });
  }
}

/** PartyRegistry giả: ký giấy phép bằng khoá registrar thật của test, phí và quyền Admin chỉnh được. */
export class FakeOrganizationChain implements OrganizationChain {
  readonly chainId = 31337;
  contractAddress: string | null = TEST_PARTY_REGISTRY.toLowerCase();
  fee = 8_000_000_000_000_000_000n;
  admins = new Set<string>();
  failing = false;
  readonly signed: OrganizationApplication[] = [];
  private readonly registrar = new Wallet(TEST_REGISTRAR_KEY);

  async signApplication(application: OrganizationApplication) {
    this.signed.push(application);
    return this.registrar.signTypedData(
      partyRegistryDomain(this.chainId, this.contractAddress ?? ''),
      ORGANIZATION_APPLICATION_TYPES,
      application,
    );
  }

  async registrationFee() {
    if (this.failing) {
      throw new Error('connect ECONNREFUSED');
    }
    return this.fee;
  }

  async hasAdminRole(wallet: string) {
    if (this.failing) {
      throw new Error('connect ECONNREFUSED');
    }
    return this.admins.has(wallet.toLowerCase());
  }
}
