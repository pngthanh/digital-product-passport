import { Inject, Injectable } from '@nestjs/common';
import { type OrganizationDetailView, toChecksumAddress } from '@dpp/shared';
import { OrganizationNotFoundError } from '../domain/organizations.errors.js';
import { ORGANIZATION_CHAIN, type OrganizationChain } from './ports/organization-chain.port.js';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from './ports/organization.repository.js';
import { OrganizationViews } from './organization-views.js';

/** Admin xem đủ hồ sơ, mọi lần nộp đơn và nhật ký on-chain của một tổ chức trước khi quyết định. */
@Injectable()
export class GetOrganizationDetail {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    @Inject(ORGANIZATION_CHAIN) private readonly chain: OrganizationChain,
    private readonly views: OrganizationViews,
  ) {}

  async execute(organizationId: string): Promise<OrganizationDetailView> {
    const record = await this.organizations.findById(organizationId);
    if (!record) {
      throw new OrganizationNotFoundError();
    }
    const [[organization], history] = await Promise.all([
      this.views.summarize([record]),
      this.views.history(record),
    ]);
    if (!organization) {
      throw new OrganizationNotFoundError();
    }
    return {
      organization,
      ...history,
      contract: this.chain.contractAddress
        ? { chainId: this.chain.chainId, address: toChecksumAddress(this.chain.contractAddress) }
        : null,
    };
  }
}
