import { Inject, Injectable } from '@nestjs/common';
import type { AdminOrganizationList, OrganizationStage } from '@dpp/shared';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from './ports/organization.repository.js';
import { OrganizationViews } from './organization-views.js';

/** Danh sách đơn cho Admin, lọc theo giai đoạn; mặc định mọi đơn đã nộp phí. */
@Injectable()
export class ListOrganizations {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    private readonly views: OrganizationViews,
  ) {}

  async execute(stages: readonly OrganizationStage[]): Promise<AdminOrganizationList> {
    const records = await this.organizations.list(stages);
    return { items: await this.views.summarize(records) };
  }
}
