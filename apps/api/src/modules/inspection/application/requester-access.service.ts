import { Injectable } from '@nestjs/common';
import type { InspectionRequesterRole } from '@dpp/shared';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { OrganizationDirectory, type OrganizationRef } from '../../organizations/index.js';
import { ProductDirectory, type ProductRef } from '../../products/index.js';
import { InspectionProductNotFoundError } from '../domain/inspection.errors.js';

/** Bên gửi yêu cầu kiểm định cho một sản phẩm. */
export interface RequesterContext {
  role: InspectionRequesterRole;
  /** UUID Party đứng tên yêu cầu: tổ chức phát hành, hoặc Party cá nhân của chủ sở hữu. */
  partyId: string;
  product: ProductRef;
  /** Nhà sản xuất: tổ chức người dùng đại diện (để kiểm tra còn được duyệt). */
  organization: OrganizationRef | null;
}

/**
 * Ai được gửi yêu cầu kiểm định: người đại diện nhà sản xuất đã phát hành sản phẩm, hoặc chủ sở hữu
 * hiện tại. Người khác nhận "không tìm thấy" để không lộ sản phẩm.
 */
@Injectable()
export class InspectionRequesterAccess {
  constructor(
    private readonly identity: IdentityDirectory,
    private readonly organizations: OrganizationDirectory,
    private readonly products: ProductDirectory,
  ) {}

  async manufacturer(user: AuthenticatedUser, productId: string): Promise<RequesterContext> {
    const organization = await this.organizations.representedBy(user.id);
    const product =
      organization?.orgType === 'MANUFACTURER' ? await this.products.findById(productId) : null;
    if (!organization || !product || product.issuerOrgId !== organization.id) {
      throw new InspectionProductNotFoundError();
    }
    return { role: 'MANUFACTURER', partyId: organization.id, product, organization };
  }

  async owner(user: AuthenticatedUser, productId: string): Promise<RequesterContext> {
    const actor = await this.identity.actorOf(user.id);
    const product = actor ? await this.products.findById(productId) : null;
    if (!actor || !product || product.currentOwnerPartyId !== actor.partyId) {
      throw new InspectionProductNotFoundError();
    }
    return { role: 'OWNER', partyId: actor.partyId, product, organization: null };
  }

  /** Các Party người dùng được đứng tên: Party cá nhân và tổ chức đang đại diện (nếu có). */
  async partiesOf(user: AuthenticatedUser): Promise<string[]> {
    const [actor, organization] = await Promise.all([
      this.identity.actorOf(user.id),
      this.organizations.representedBy(user.id),
    ]);
    return [actor?.partyId, organization?.id].filter((id): id is string => !!id);
  }
}
