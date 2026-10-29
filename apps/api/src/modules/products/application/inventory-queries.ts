import { Inject, Injectable } from '@nestjs/common';
import type { InventoryDetail, InventoryFilter, InventoryItem, MyInventory } from '@dpp/shared';
import type { AuthenticatedUser } from '../../identity/index.js';
import { ProductNotFoundError } from '../domain/products.errors.js';
import { RetailerAccess } from './organization-access.service.js';
import { PRODUCT_CHAIN, type ProductChain } from './ports/product-chain.port.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';
import { contractInfoOf } from './product-queries.js';
import { presentProduct, ProductViews } from './product-views.js';

const EMPTY_COUNTS: Record<InventoryFilter, number> = { INCOMING: 0, IN_STOCK: 0, SOLD: 0 };

export interface InventoryListQuery {
  filter: InventoryFilter;
  page: number;
  pageSize: number;
}

/** Kho hàng của nhà bán lẻ: chờ nhận (DST-02), đang bán, đã bán (DST-03). */
@Injectable()
export class ListMyInventory {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_CHAIN) private readonly chain: ProductChain,
    private readonly access: RetailerAccess,
    private readonly views: ProductViews,
  ) {}

  async execute(user: AuthenticatedUser, query: InventoryListQuery): Promise<MyInventory> {
    const retailer = await this.access.find(user);
    const base = {
      contract: contractInfoOf(this.chain),
      page: query.page,
      pageSize: query.pageSize,
    };
    if (!retailer) {
      return { ...base, retailer: null, items: [], total: 0, counts: EMPTY_COUNTS };
    }
    const [{ items, total }, counts] = await Promise.all([
      this.products.listInventory({ retailerPartyId: retailer.id, ...query }),
      this.products.inventoryCounts(retailer.id),
    ]);
    const [labels, soldAt] = await Promise.all([
      this.views.labels(items),
      this.products.soldAtBy(
        retailer.id,
        items.map((item) => item.id),
      ),
    ]);
    return {
      ...base,
      retailer: {
        organizationId: retailer.id,
        name: retailer.name,
        partyId: retailer.partyId,
        authStatus: retailer.authStatus,
        orgType: retailer.orgType,
      },
      items: items.map((item): InventoryItem => ({
        ...presentProduct(item, labels),
        issuer: labels.issuer(item.issuerOrgId),
        soldAt: soldAt.get(item.id)?.toISOString() ?? null,
      })),
      total,
      counts,
    };
  }
}

/** Chi tiết một sản phẩm trong kho của nhà bán lẻ (đang giao tới, đang giữ hoặc đã bán). */
@Injectable()
export class GetInventoryItem {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly access: RetailerAccess,
    private readonly views: ProductViews,
  ) {}

  async execute(user: AuthenticatedUser, productId: string): Promise<InventoryDetail> {
    const retailer = await this.access.find(user);
    const product = retailer ? await this.products.findForRetailer(retailer.id, productId) : null;
    if (!retailer || !product) {
      throw new ProductNotFoundError();
    }
    const timeline = await this.views.timeline(product, null);
    const issuer = timeline.labels.issuer(product.issuerOrgId);
    const [proof, soldAt] = await Promise.all([
      this.views.proof(product, issuer.partyId),
      this.products.soldAtBy(retailer.id, [product.id]),
    ]);
    return {
      ...presentProduct(product, timeline.labels),
      description: product.description,
      issuer,
      proof,
      warranty: timeline.warranty,
      journey: timeline.journey,
      history: timeline.history,
      soldAt: soldAt.get(product.id)?.toISOString() ?? null,
    };
  }
}
