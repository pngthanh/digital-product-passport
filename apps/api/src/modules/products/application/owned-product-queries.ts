import { Inject, Injectable } from '@nestjs/common';
import type { MyWorkspace, OwnedProduct, OwnedProductDetail } from '@dpp/shared';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { OrganizationDirectory } from '../../organizations/index.js';
import { ProductNotFoundError } from '../domain/products.errors.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';
import { presentProduct, ProductViews } from './product-views.js';

/** Sản phẩm người dùng đang sở hữu (sau DST-03), kèm bảo hành. */
@Injectable()
export class ListOwnedProducts {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly identity: IdentityDirectory,
    private readonly views: ProductViews,
  ) {}

  async execute(user: AuthenticatedUser): Promise<OwnedProduct[]> {
    const actor = await this.identity.actorOf(user.id);
    if (!actor) {
      return [];
    }
    const items = await this.products.listOwned(actor.partyId);
    const [warranties, acquired] = await Promise.all([
      this.views.warranties(items),
      this.products.acquiredAt(
        actor.partyId,
        items.map((item) => item.id),
      ),
    ]);
    const labels = await this.views.labels(
      items,
      actor.partyId,
      [...warranties.values()].map((warranty) => warranty.activatedByPartyId),
    );
    return items.map((item) => ({
      ...presentProduct(item, labels),
      issuer: labels.issuer(item.issuerOrgId),
      warranty: this.views.presentWarranty(item, warranties.get(item.id), labels),
      acquiredAt: (acquired.get(item.id) ?? item.createdAt).toISOString(),
    }));
  }
}

/** Chi tiết một sản phẩm người dùng đang sở hữu. */
@Injectable()
export class GetOwnedProduct {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly identity: IdentityDirectory,
    private readonly views: ProductViews,
  ) {}

  async execute(user: AuthenticatedUser, productId: string): Promise<OwnedProductDetail> {
    const actor = await this.identity.actorOf(user.id);
    const product = actor ? await this.products.findById(productId) : null;
    if (!actor || !product || product.currentOwnerPartyId !== actor.partyId) {
      throw new ProductNotFoundError();
    }
    const timeline = await this.views.timeline(product, actor.partyId);
    const issuer = timeline.labels.issuer(product.issuerOrgId);
    const [proof, acquired] = await Promise.all([
      this.views.proof(product, issuer.partyId),
      this.products.acquiredAt(actor.partyId, [product.id]),
    ]);
    return {
      ...presentProduct(product, timeline.labels),
      issuer,
      warranty: timeline.warranty,
      acquiredAt: (acquired.get(product.id) ?? product.createdAt).toISOString(),
      description: product.description,
      proof,
      journey: timeline.journey,
      history: timeline.history,
    };
  }
}

/** Menu theo vai trò: tổ chức đang đại diện (nhà sản xuất, nhà bán lẻ...) và số sản phẩm đang sở hữu. */
@Injectable()
export class GetWorkspace {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly identity: IdentityDirectory,
    private readonly organizations: OrganizationDirectory,
  ) {}

  async execute(user: AuthenticatedUser): Promise<MyWorkspace> {
    const [organization, actor] = await Promise.all([
      this.organizations.representedBy(user.id),
      this.identity.actorOf(user.id),
    ]);
    return {
      organization: organization
        ? {
            organizationId: organization.id,
            name: organization.name,
            orgType: organization.orgType,
            authStatus: organization.authStatus,
          }
        : null,
      ownedProducts: actor ? await this.products.countOwned(actor.partyId) : 0,
    };
  }
}
