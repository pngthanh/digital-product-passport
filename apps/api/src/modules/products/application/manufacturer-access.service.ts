import { Injectable } from '@nestjs/common';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { OrganizationDirectory, type OrganizationRef } from '../../organizations/index.js';
import {
  ManufacturerRequiredError,
  ProductWalletRequiredError,
} from '../domain/products.errors.js';

export interface ManufacturerActor {
  organization: OrganizationRef;
  /** Ví cá nhân đang dùng của người đại diện (chữ thường). */
  wallet: string;
}

/** Ai được thao tác sản phẩm: người đại diện của nhà sản xuất, ký bằng ví cá nhân (D25). */
@Injectable()
export class ManufacturerAccess {
  constructor(
    private readonly organizations: OrganizationDirectory,
    private readonly identity: IdentityDirectory,
  ) {}

  /** Nhà sản xuất do người dùng đại diện, ở mọi trạng thái; `null` nếu không phải nhà sản xuất. */
  async find(user: AuthenticatedUser): Promise<OrganizationRef | null> {
    const organization = await this.organizations.representedBy(user.id);
    return organization?.orgType === 'MANUFACTURER' ? organization : null;
  }

  /** Nhà sản xuất đã duyệt và ví đang dùng; contract cũng kiểm tra đúng điều kiện này. */
  async require(user: AuthenticatedUser): Promise<ManufacturerActor> {
    const organization = await this.find(user);
    if (organization?.authStatus !== 'AUTHORIZED') {
      throw new ManufacturerRequiredError();
    }
    const actor = await this.identity.actorOf(user.id);
    if (!actor?.activeWallet) {
      throw new ProductWalletRequiredError();
    }
    return { organization, wallet: actor.activeWallet };
  }
}
