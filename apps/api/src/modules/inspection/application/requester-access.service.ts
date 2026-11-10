import { Injectable } from '@nestjs/common';
import type { InspectionRequesterRole } from '@dpp/shared';
import type { AuthenticatedUser } from '../../identity/index.js';
import { OrganizationDirectory, type OrganizationRef } from '../../organizations/index.js';
import { OwnerParties, ProductDirectory, type ProductRef } from '../../products/index.js';
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
    private readonly owners: OwnerParties,
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

  /** Chủ sở hữu hiện tại: Party cá nhân, hoặc (M9) tổ chức người dùng đại diện. */
  async owner(user: AuthenticatedUser, productId: string): Promise<RequesterContext> {
    const { partyIds } = await this.owners.of(user.id);
    const product = partyIds.length > 0 ? await this.products.findById(productId) : null;
    const ownerPartyId = product?.currentOwnerPartyId;
    if (!product || !ownerPartyId || !partyIds.includes(ownerPartyId)) {
      throw new InspectionProductNotFoundError();
    }
    return { role: 'OWNER', partyId: ownerPartyId, product, organization: null };
  }

  /** Các Party người dùng được đứng tên: Party cá nhân và tổ chức đang đại diện (nếu có). */
  async partiesOf(user: AuthenticatedUser): Promise<string[]> {
    return (await this.owners.of(user.id)).partyIds;
  }
}
