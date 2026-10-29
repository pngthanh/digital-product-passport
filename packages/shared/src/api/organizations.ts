/*
 * Hợp đồng dữ liệu của module Organizations & Fee (M4), dùng chung cho API và Web.
 */

import type { OrganizationMethod, PartyRegistryAdminMethod } from '../chain/party-registry.js';
import type { AuthStatus, FeeAction, FeeStatus, OrgType } from '../domain/enums.js';
import type { OrganizationProfile } from '../domain/organization-profile.js';
import type { ChainEventView } from './chain.js';

/**
 * Giai đoạn hiển thị của đơn: DRAFT là đã lưu hồ sơ nhưng chưa nộp phí on-chain;
 * các giá trị còn lại là `auth_status` do Indexer chiếu từ contract.
 */
export type OrganizationStage = 'DRAFT' | AuthStatus;

export interface FeePolicySummary {
  action: FeeAction;
  /** wei, chuỗi thập phân. */
  amountWei: string;
  treasury: string;
}

export interface FeePaymentSummary {
  amountWei: string;
  feeStatus: FeeStatus;
  payerAddress: string;
  paidTxHash: string;
  paidAt: string;
  settledTxHash: string | null;
  refundTxHash: string | null;
}

export interface RepresentativeSummary {
  userId: string;
  fullName: string;
  email: string;
}

export interface OrganizationSummary {
  id: string;
  /** partyId (bytes32) của tổ chức trên contract. */
  partyId: string;
  name: string;
  taxCode: string;
  orgType: OrgType;
  contactEmail: string;
  contactPhone: string | null;
  address: string | null;
  profileHash: string | null;
  stage: OrganizationStage;
  /** Lý do từ chối hoặc khoá gần nhất. */
  statusReason: string | null;
  appliedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  disabledAt: string | null;
  representative: RepresentativeSummary;
  /** Mới nhất trước. */
  feePayments: FeePaymentSummary[];
  /** Tổng phí đang chờ người đại diện rút (đơn bị từ chối). */
  refundableWei: string;
}

export interface ContractInfo {
  chainId: number;
  address: string;
}

/** Một lần nộp đơn (kể cả lần bị từ chối), giữ nguyên để đối chiếu. */
export interface OrganizationApplicationView {
  round: number;
  status: Exclude<AuthStatus, 'DISABLED'>;
  orgType: OrgType;
  /** Hồ sơ đã nộp; `null` ở lần nộp trước khi hệ thống lưu bản chụp (trước M5). */
  profile: OrganizationProfile | null;
  /** Hash hồ sơ đã ghi on-chain trong OrganizationApplied. */
  profileHash: string;
  /** Băm lại `profile` có ra đúng `profileHash` không; `null` khi không có bản chụp. */
  profileMatchesChain: boolean | null;
  applicantAddress: string;
  appliedTxHash: string;
  appliedAt: string;
  fee: FeePaymentSummary | null;
  /** Lý do từ chối Admin đã nhập; contract chỉ lưu `decisionReasonHash`. */
  decisionReason: string | null;
  decisionReasonHash: string | null;
  /** Băm lại lý do có ra đúng hash on-chain không; `null` khi không có lý do. */
  reasonMatchesChain: boolean | null;
  decidedByAddress: string | null;
  decidedTxHash: string | null;
  decidedAt: string | null;
}

/** Hồ sơ hiện tại, mọi lần nộp đơn và nhật ký event on-chain của một tổ chức. */
export interface OrganizationHistory {
  /** Mới nhất trước. */
  applications: OrganizationApplicationView[];
  /** Mọi event FINALIZED của Party tổ chức trên PartyRegistry, cũ nhất trước. */
  chainLog: ChainEventView[];
}

/** `GET /admin/organizations/:id`. */
export interface OrganizationDetailView extends OrganizationHistory {
  organization: OrganizationSummary;
  contract: ContractInfo | null;
}

/** `GET /me/organization`. */
export interface MyOrganizationView {
  organization: OrganizationSummary | null;
  /** Rỗng khi chưa có tổ chức. */
  history: OrganizationHistory;
  /** `null` khi Indexer chưa chiếu FeeUpdated (contract chưa cấu hình). */
  registrationFee: FeePolicySummary | null;
  /** `null` khi API chưa cấu hình PartyRegistry. */
  contract: ContractInfo | null;
}

/** Kết quả báo txHash: giao dịch đã được ghi nhận, Worker chốt khi block finalized. */
export interface TrackedTransactionView {
  txHash: string;
  status: 'SUBMITTED' | 'CONFIRMED' | 'REVERTED' | 'FAILED';
}

/** Thông tin người đại diện nhập khi nộp hoặc sửa đơn. */
export interface OrganizationApplicationInput {
  name: string;
  taxCode: string;
  orgType: OrgType;
  contactEmail: string;
  contactPhone?: string | null;
  address?: string | null;
}

/** Giấy phép EIP-712 để ví cá nhân của người đại diện tự gửi `applyOrganization` kèm phí. */
export interface OrganizationApplicationAuthorization {
  organizationId: string;
  method: Extract<OrganizationMethod, 'applyOrganization'>;
  chainId: number;
  contractAddress: string;
  partyId: string;
  representativeId: string;
  role: string;
  profileHash: string;
  /** Ví cá nhân phải gửi giao dịch. */
  wallet: string;
  feeWei: string;
  /** Giây Unix, dạng chuỗi thập phân. */
  deadline: string;
  signature: string;
}

/** Thông tin để ví gọi một hàm của PartyRegistry, sau đó web báo txHash cho API. */
export interface PartyRegistryCall<M extends string> {
  method: M;
  chainId: number;
  contractAddress: string;
  /** Ví phải gửi giao dịch (ví cá nhân đang dùng của người gọi). */
  wallet: string;
}

export type OrganizationTransactionKind = OrganizationMethod;

export type AdminDecision = 'REJECT' | 'DISABLE';

/** `POST /admin/organizations/:id/decisions`: lý do đã lưu, ví Admin gửi giao dịch với `reasonHash`. */
export interface AdminDecisionCall extends PartyRegistryCall<
  Extract<PartyRegistryAdminMethod, 'rejectOrganization' | 'disableOrganization'>
> {
  partyId: string;
  reasonHash: string;
}

export interface AdminOrganizationList {
  items: OrganizationSummary[];
}

/** `GET /admin/overview`: phí hiện hành và ví Admin trên contract. */
export interface AdminOverview {
  registrationFee: FeePolicySummary | null;
  contract: ContractInfo | null;
  /** Ví cá nhân của Admin đang đăng nhập; `null` khi chưa liên kết. */
  adminWallet: string | null;
  /** Ví đó có DEFAULT_ADMIN_ROLE trên PartyRegistry không; `null` khi không đọc được chain. */
  walletHasAdminRole: boolean | null;
  counts: Record<OrganizationStage, number>;
}
