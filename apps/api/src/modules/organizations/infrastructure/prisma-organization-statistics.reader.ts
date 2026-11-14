import { Injectable } from '@nestjs/common';
import type { OrganizationStage, OrgType } from '@dpp/shared';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { OrganizationStatistics } from '../application/ports/organization-statistics.reader.js';

function emptyStages(): Record<OrganizationStage, number> {
  return { DRAFT: 0, PENDING: 0, AUTHORIZED: 0, REJECTED: 0, DISABLED: 0 };
}

@Injectable()
export class PrismaOrganizationStatistics implements OrganizationStatistics {
  constructor(private readonly prisma: PrismaService) {}

  async byTypeAndStage(): Promise<Record<OrgType, Record<OrganizationStage, number>>> {
    const [byStatus, drafts] = await Promise.all([
      this.prisma.organization.groupBy({ by: ['orgType', 'authStatus'], _count: { _all: true } }),
      this.prisma.organization.groupBy({
        by: ['orgType'],
        where: { authStatus: 'PENDING', appliedAt: null },
        _count: { _all: true },
      }),
    ]);
    const result: Record<OrgType, Record<OrganizationStage, number>> = {
      MANUFACTURER: emptyStages(),
      RETAILER: emptyStages(),
      SERVICE_CENTER: emptyStages(),
      INSPECTOR: emptyStages(),
    };
    for (const group of byStatus) {
      result[group.orgType][group.authStatus] = group._count._all;
    }
    // Bản nháp là PENDING chưa nộp đơn (giống bộ lọc trang Doanh nghiệp).
    for (const group of drafts) {
      result[group.orgType].DRAFT = group._count._all;
      result[group.orgType].PENDING -= group._count._all;
    }
    return result;
  }
}
