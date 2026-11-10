import { Inject, Injectable } from '@nestjs/common';
import type { MyWorkspace, OwnedProduct, OwnedProductDetail } from '@dpp/shared';
import type { AuthenticatedUser } from '../../identity/index.js';
import { ProductNotFoundError } from '../domain/products.errors.js';
import { OwnerParties } from './owner-parties.service.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';
import { presentProduct, ProductViews } from './product-views.js';

/**
 * Sản phẩm người dùng đang sở hữu (sau DST-03), kèm bảo hành; (M9) gồm cả sản phẩm của tổ chức người
 * dùng đại diện.
 */
@Injectable()
export class ListOwnedProducts {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly owners: OwnerParties,
    private readonly views: ProductViews,
  ) {}

  async execute(user: AuthenticatedUser): Promise<OwnedProduct[]> {
    const { actor, partyIds } = await this.owners.of(user.id);
    if (partyIds.length === 0) {
      return [];
    }
    const items = await this.products.listOwned(partyIds);
    const [warranties, acquired] = await Promise.all([
      this.views.warranties(items),
      this.products.acquiredAt(
        partyIds,
        items.map((item) => item.id),
      ),
    ]);
    const labels = await this.views.labels(
      items,
      actor?.partyId ?? null,
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
    private readonly owners: OwnerParties,
    private readonly views: ProductViews,
  ) {}

  async execute(user: AuthenticatedUser, productId: string): Promise<OwnedProductDetail> {
    const { actor, partyIds } = await this.owners.of(user.id);
    const product = partyIds.length > 0 ? await this.products.findById(productId) : null;
    if (!product?.currentOwnerPartyId || !partyIds.includes(product.currentOwnerPartyId)) {
      throw new ProductNotFoundError();
    }
    const timeline = await this.views.timeline(product, actor?.partyId ?? null);
    const issuer = timeline.labels.issuer(product.issuerOrgId);
    const [proof, acquired] = await Promise.all([
      this.views.proof(product, issuer.partyId),
      this.products.acquiredAt(partyIds, [product.id]),
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
    private readonly owners: OwnerParties,
  ) {}

  async execute(user: AuthenticatedUser): Promise<MyWorkspace> {
    const { organization, partyIds } = await this.owners.of(user.id);
    return {
      organization: organization
        ? {
            organizationId: organization.id,
            name: organization.name,
            orgType: organization.orgType,
            authStatus: organization.authStatus,
          }
        : null,
      ownedProducts: partyIds.length > 0 ? await this.products.countOwned(partyIds) : 0,
    };
  }
}
