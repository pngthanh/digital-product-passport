import { Inject, Injectable } from '@nestjs/common';
import { type MyOrganizationView, toChecksumAddress } from '@dpp/shared';
import type { AuthenticatedUser } from '../../identity/index.js';
import { ORGANIZATION_CHAIN, type OrganizationChain } from './ports/organization-chain.port.js';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from './ports/organization.repository.js';
import { OrganizationViews } from './organization-views.js';

/** Doanh nghiệp do người dùng đại diện, các lần nộp đơn, nhật ký on-chain và phí đăng ký hiện hành. */
@Injectable()
export class GetMyOrganization {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    @Inject(ORGANIZATION_CHAIN) private readonly chain: OrganizationChain,
    private readonly views: OrganizationViews,
  ) {}

  async execute(user: AuthenticatedUser): Promise<MyOrganizationView> {
    const record = await this.organizations.findByRepresentative(user.id);
    const [summaries, history, registrationFee] = await Promise.all([
      record ? this.views.summarize([record]) : Promise.resolve([]),
      record ? this.views.history(record) : Promise.resolve({ applications: [], chainLog: [] }),
      this.views.registrationFee(),
    ]);
    return {
      organization: summaries[0] ?? null,
      history,
      registrationFee,
      contract: this.chain.contractAddress
        ? { chainId: this.chain.chainId, address: toChecksumAddress(this.chain.contractAddress) }
        : null,
    };
  }
}
