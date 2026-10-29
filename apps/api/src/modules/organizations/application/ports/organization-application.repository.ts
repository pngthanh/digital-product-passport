import type { OrganizationProfile, OrgType } from '@dpp/shared';
import type { TransactionScope } from '../../../../common/persistence/transaction-scope.js';
import type { OrganizationApplicationRecord } from '../../domain/organization-application.js';

export interface AppliedRound {
  organizationId: string;
  orgType: OrgType;
  profile: OrganizationProfile | null;
  profileHash: string;
  applicantAddress: string;
  txHash: string;
  appliedAt: Date;
}

export type RoundDecision =
  | { status: 'AUTHORIZED'; decidedBy: string; txHash: string; at: Date }
  | { status: 'REJECTED'; reasonHash: string; decidedBy: string; txHash: string; at: Date };

/** Bảng organization_applications. */
export interface OrganizationApplicationRepository {
  /** Mới nhất trước. */
  listFor(organizationId: string): Promise<OrganizationApplicationRecord[]>;
  /** Tạo lần nộp tiếp theo; giao dịch đã ghi rồi thì bỏ qua (chiếu lại không tạo trùng). */
  recordApplied(round: AppliedRound, scope: TransactionScope): Promise<void>;
  attachFee(appliedTxHash: string, feePaymentId: string, scope: TransactionScope): Promise<void>;
  /** Lưu lý do vào lần nộp đang chờ trước khi ví Admin gửi rejectOrganization. */
  saveDecisionReason(organizationId: string, reason: string): Promise<void>;
  /** Chốt lần nộp đang chờ; trả về dòng đã chốt, `null` nếu không có lần nộp đang chờ. */
  decide(
    organizationId: string,
    decision: RoundDecision,
    scope: TransactionScope,
  ): Promise<OrganizationApplicationRecord | null>;
}

export const ORGANIZATION_APPLICATION_REPOSITORY = Symbol('ORGANIZATION_APPLICATION_REPOSITORY');
