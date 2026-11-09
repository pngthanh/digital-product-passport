import { Injectable } from '@nestjs/common';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { OrganizationDirectory, type OrganizationRef } from '../../organizations/index.js';
import {
  InspectionWalletRequiredError,
  InspectorRequiredError,
} from '../domain/inspection.errors.js';

export interface InspectorActor {
  organization: OrganizationRef;
  /** Ví cá nhân đang dùng của người đại diện (chữ thường). */
  wallet: string;
}

/**
 * Người đại diện của đơn vị kiểm định, ký bằng ví cá nhân (D25). Contract kiểm tra đúng điều kiện
 * này (`authorizedOrganizationOf(ví, INSPECTOR_ROLE)`), API kiểm tra trước để báo lỗi sớm.
 */
@Injectable()
export class InspectorAccess {
  constructor(
    private readonly organizations: OrganizationDirectory,
    private readonly identity: IdentityDirectory,
  ) {}

  /** Đơn vị kiểm định do người dùng đại diện, ở mọi trạng thái; `null` nếu không có. */
  async find(user: AuthenticatedUser): Promise<OrganizationRef | null> {
    const organization = await this.organizations.representedBy(user.id);
    return organization?.orgType === 'INSPECTOR' ? organization : null;
  }

  /** Đơn vị đã duyệt (xem, từ chối yêu cầu không cần ví). */
  async requireOrganization(user: AuthenticatedUser): Promise<OrganizationRef> {
    const organization = await this.find(user);
    if (organization?.authStatus !== 'AUTHORIZED') {
      throw new InspectorRequiredError();
    }
    return organization;
  }

  /** Đơn vị đã duyệt và ví đang dùng của người đại diện (ghi kết quả on-chain). */
  async require(user: AuthenticatedUser): Promise<InspectorActor> {
    const organization = await this.requireOrganization(user);
    const actor = await this.identity.actorOf(user.id);
    if (!actor?.activeWallet) {
      throw new InspectionWalletRequiredError();
    }
    return { organization, wallet: actor.activeWallet };
  }
}
