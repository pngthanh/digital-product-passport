import { Inject, Injectable } from '@nestjs/common';
import { type AdminOverview, toChecksumAddress } from '@dpp/shared';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { ORGANIZATION_CHAIN, type OrganizationChain } from './ports/organization-chain.port.js';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from './ports/organization.repository.js';
import { OrganizationViews } from './organization-views.js';

/** Trang tổng quan Quản trị: phí hiện hành, số đơn theo giai đoạn, ví Admin có đủ quyền on-chain chưa. */
@Injectable()
export class GetAdminOverview {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    @Inject(ORGANIZATION_CHAIN) private readonly chain: OrganizationChain,
    private readonly views: OrganizationViews,
    private readonly identity: IdentityDirectory,
  ) {}

  async execute(admin: AuthenticatedUser): Promise<AdminOverview> {
    const [actor, registrationFee, counts] = await Promise.all([
      this.identity.actorOf(admin.id),
      this.views.registrationFee(),
      this.organizations.countByStage(),
    ]);
    const adminWallet = actor?.activeWallet ?? null;
    let walletHasAdminRole: boolean | null = null;
    if (adminWallet && this.chain.contractAddress) {
      walletHasAdminRole = await this.chain.hasAdminRole(adminWallet).catch(() => null);
    }
    return {
      registrationFee,
      contract: this.chain.contractAddress
        ? { chainId: this.chain.chainId, address: toChecksumAddress(this.chain.contractAddress) }
        : null,
      adminWallet: adminWallet && toChecksumAddress(adminWallet),
      walletHasAdminRole,
      counts,
    };
  }
}
