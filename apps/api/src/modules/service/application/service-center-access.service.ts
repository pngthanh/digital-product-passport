import { Injectable } from '@nestjs/common';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { OrganizationDirectory, type OrganizationRef } from '../../organizations/index.js';
import {
  ServiceCenterRequiredError,
  ServiceWalletRequiredError,
} from '../domain/service.errors.js';

export interface ServiceCenterActor {
  organization: OrganizationRef;
  /** Ví cá nhân đang dùng của người đại diện (chữ thường). */
  wallet: string;
}

/**
 * Người đại diện của trung tâm bảo hành, ký bằng ví cá nhân (D25). Contract kiểm tra đúng điều kiện
 * này (`authorizedOrganizationOf(ví, SERVICE_CENTER_ROLE)`), API kiểm tra trước để báo lỗi sớm.
 */
@Injectable()
export class ServiceCenterAccess {
  constructor(
    private readonly organizations: OrganizationDirectory,
    private readonly identity: IdentityDirectory,
  ) {}

  /** Trung tâm bảo hành do người dùng đại diện, ở mọi trạng thái; `null` nếu không có. */
  async find(user: AuthenticatedUser): Promise<OrganizationRef | null> {
    const organization = await this.organizations.representedBy(user.id);
    return organization?.orgType === 'SERVICE_CENTER' ? organization : null;
  }

  /** Trung tâm đã duyệt (xem phiếu không cần ví). */
  async requireOrganization(user: AuthenticatedUser): Promise<OrganizationRef> {
    const organization = await this.find(user);
    if (organization?.authStatus !== 'AUTHORIZED') {
      throw new ServiceCenterRequiredError();
    }
    return organization;
  }

  /** Trung tâm đã duyệt và ví đang dùng của người đại diện (thao tác ghi on-chain). */
  async require(user: AuthenticatedUser): Promise<ServiceCenterActor> {
    const organization = await this.requireOrganization(user);
    const actor = await this.identity.actorOf(user.id);
    if (!actor?.activeWallet) {
      throw new ServiceWalletRequiredError();
    }
    return { organization, wallet: actor.activeWallet };
  }
}
