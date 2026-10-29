import type { AuthStatus, OrganizationProfile, OrganizationStage, OrgType } from '@dpp/shared';

/** Dòng organizations (dữ liệu [A+P]). */
export interface OrganizationRecord extends OrganizationProfile {
  id: string;
  representativeUserId: string;
  profileHash: string | null;
  authStatus: AuthStatus;
  statusReason: string | null;
  appliedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  disabledAt: Date | null;
  createdAt: Date;
}

/**
 * Đơn mới lưu hồ sơ nhưng chưa nộp phí on-chain có auth_status mặc định PENDING và applied_at rỗng;
 * giao diện gọi đó là bản nháp (DRAFT) để không lẫn với đơn đang chờ duyệt.
 */
export function stageOf(
  organization: Pick<OrganizationRecord, 'authStatus' | 'appliedAt'>,
): OrganizationStage {
  return organization.authStatus === 'PENDING' && organization.appliedAt === null
    ? 'DRAFT'
    : organization.authStatus;
}

/** Người đại diện chỉ sửa và nộp (lại) hồ sơ khi đơn là bản nháp hoặc đã bị từ chối. */
export function canEditApplication(stage: OrganizationStage): boolean {
  return stage === 'DRAFT' || stage === 'REJECTED';
}

/** Admin chỉ từ chối đơn đang chờ duyệt và chỉ khoá tổ chức đã được duyệt. */
export function decisionAllowed(stage: OrganizationStage, decision: 'REJECT' | 'DISABLE'): boolean {
  return decision === 'REJECT' ? stage === 'PENDING' : stage === 'AUTHORIZED';
}

/** Chuẩn hoá hồ sơ trước khi lưu và băm: bỏ khoảng trắng thừa, email chữ thường, SĐT chỉ còn số. */
export function normalizeProfile(input: {
  name: string;
  taxCode: string;
  orgType: OrgType;
  contactEmail: string;
  contactPhone?: string | null;
  address?: string | null;
}): OrganizationProfile {
  const phone = input.contactPhone?.replace(/[\s.()-]/g, '') ?? '';
  const address = input.address?.trim().replace(/\s+/g, ' ') ?? '';
  return {
    name: input.name.trim().replace(/\s+/g, ' '),
    taxCode: input.taxCode.trim(),
    orgType: input.orgType,
    contactEmail: input.contactEmail.trim().toLowerCase(),
    contactPhone: phone === '' ? null : phone,
    address: address === '' ? null : address,
  };
}
