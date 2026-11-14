import type { OrganizationStage, OrgType } from '@dpp/shared';

/** (M12) Số doanh nghiệp theo loại và giai đoạn duyệt, cho dashboard Admin (AUD-02). */
export interface OrganizationStatistics {
  byTypeAndStage(): Promise<Record<OrgType, Record<OrganizationStage, number>>>;
}

export const ORGANIZATION_STATISTICS = Symbol('ORGANIZATION_STATISTICS');
