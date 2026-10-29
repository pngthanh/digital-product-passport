import {
  type AuthStatus,
  type OrganizationProfile,
  organizationProfileHash,
  type OrgType,
  statusReasonHash,
} from '@dpp/shared';

export type ApplicationStatus = Exclude<AuthStatus, 'DISABLED'>;

/** Dòng organization_applications: một lần nộp đơn (dữ liệu [A+P]). */
export interface OrganizationApplicationRecord {
  id: string;
  organizationId: string;
  round: number;
  orgType: OrgType;
  /** Bản chụp hồ sơ lúc nộp; `null` ở lần nộp trước M5. */
  profile: OrganizationProfile | null;
  profileHash: string;
  applicantAddress: string;
  appliedTxHash: string;
  appliedAt: Date;
  feePaymentId: string | null;
  status: ApplicationStatus;
  decisionReason: string | null;
  decisionReasonHash: string | null;
  decidedByAddress: string | null;
  decidedTxHash: string | null;
  decidedAt: Date | null;
}

/** Băm lại bản chụp để chứng minh hồ sơ hiển thị đúng là hồ sơ đã nộp on-chain. */
export function profileMatchesChain(
  application: Pick<OrganizationApplicationRecord, 'profile' | 'profileHash'>,
): boolean | null {
  return application.profile
    ? organizationProfileHash(application.profile) === application.profileHash
    : null;
}

/** Lý do Admin nhập có băm ra đúng hash đã gửi on-chain không. */
export function reasonMatchesChain(
  application: Pick<OrganizationApplicationRecord, 'decisionReason' | 'decisionReasonHash'>,
): boolean | null {
  return application.decisionReason && application.decisionReasonHash
    ? statusReasonHash(application.decisionReason) === application.decisionReasonHash
    : null;
}
