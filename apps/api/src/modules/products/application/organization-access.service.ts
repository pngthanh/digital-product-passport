import { Injectable } from '@nestjs/common';
import type { OrgType } from '@dpp/shared';
import type { DomainError } from '../../../common/domain/domain-error.js';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { OrganizationDirectory, type OrganizationRef } from '../../organizations/index.js';
import {
  ManufacturerRequiredError,
  ProductWalletRequiredError,
  RetailerRequiredError,
} from '../domain/products.errors.js';

export interface OrganizationActor {
  organization: OrganizationRef;
  /** Ví cá nhân đang dùng của người đại diện (chữ thường). */
  wallet: string;
}

/**
 * Ai được thao tác sản phẩm thay một tổ chức: người đại diện, ký bằng ví cá nhân (D25). Contract
 * kiểm tra đúng điều kiện này (`authorizedOrganizationOf`), API kiểm tra trước để báo lỗi sớm.
 */
abstract class OrganizationRoleAccess {
  protected constructor(
    private readonly organizations: OrganizationDirectory,
    private readonly identity: IdentityDirectory,
    private readonly orgType: OrgType,
    private readonly missingRole: () => DomainError,
  ) {}

  /** Tổ chức đúng loại do người dùng đại diện, ở mọi trạng thái; `null` nếu không có. */
  async find(user: AuthenticatedUser): Promise<OrganizationRef | null> {
    const organization = await this.organizations.representedBy(user.id);
    return organization?.orgType === this.orgType ? organization : null;
  }

  /** Tổ chức đã duyệt và ví đang dùng của người đại diện. */
  async require(user: AuthenticatedUser): Promise<OrganizationActor> {
    const organization = await this.find(user);
    if (organization?.authStatus !== 'AUTHORIZED') {
      throw this.missingRole();
    }
    const actor = await this.identity.actorOf(user.id);
    if (!actor?.activeWallet) {
      throw new ProductWalletRequiredError();
    }
    return { organization, wallet: actor.activeWallet };
  }
}

/** Người đại diện của nhà sản xuất (PRD-01..03, DST-01). */
@Injectable()
export class ManufacturerAccess extends OrganizationRoleAccess {
  constructor(organizations: OrganizationDirectory, identity: IdentityDirectory) {
    super(organizations, identity, 'MANUFACTURER', () => new ManufacturerRequiredError());
  }
}

/** Người đại diện của nhà bán lẻ (DST-02, DST-03). */
@Injectable()
export class RetailerAccess extends OrganizationRoleAccess {
  constructor(organizations: OrganizationDirectory, identity: IdentityDirectory) {
    super(organizations, identity, 'RETAILER', () => new RetailerRequiredError());
  }
}
