import { Inject, Injectable } from '@nestjs/common';
import {
  type ContractInfo,
  type MyProductList,
  type ProductDetail,
  type ProductListFilter,
  type PublicPassportView,
  type RetailerOption,
  toChecksumAddress,
} from '@dpp/shared';
import type { AuthenticatedUser } from '../../identity/index.js';
import { OrganizationDirectory } from '../../organizations/index.js';
import { isDraft } from '../domain/product.js';
import { ProductNotFoundError } from '../domain/products.errors.js';
import { ManufacturerAccess } from './organization-access.service.js';
import { organizationLabel } from './party-labels.js';
import { PRODUCT_CHAIN, type ProductChain } from './ports/product-chain.port.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';
import { presentProduct, ProductViews } from './product-views.js';

const EMPTY_COUNTS: Record<ProductListFilter, number> = {
  ALL: 0,
  REGISTERED: 0,
  DRAFT: 0,
  RECALLED: 0,
};

export interface MyProductListQuery {
  filter: ProductListFilter;
  search: string | null;
  page: number;
  pageSize: number;
}

/** Thông tin contract ProductPassport đang dùng; `null` khi chưa cấu hình. */
export function contractInfoOf(chain: ProductChain): ContractInfo | null {
  return chain.contractAddress
    ? { chainId: chain.chainId, address: toChecksumAddress(chain.contractAddress) }
    : null;
}

/** Danh sách sản phẩm của nhà sản xuất mà người dùng đại diện, mới nhất trước. */
@Injectable()
export class ListMyProducts {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_CHAIN) private readonly chain: ProductChain,
    private readonly access: ManufacturerAccess,
    private readonly views: ProductViews,
  ) {}

  async execute(user: AuthenticatedUser, query: MyProductListQuery): Promise<MyProductList> {
    const organization = await this.access.find(user);
    const base = {
      contract: contractInfoOf(this.chain),
      page: query.page,
      pageSize: query.pageSize,
    };
    if (!organization) {
      return { ...base, manufacturer: null, items: [], total: 0, counts: EMPTY_COUNTS };
    }
    const [{ items, total }, counts] = await Promise.all([
      this.products.list(organization.id, query),
      this.products.counts(organization.id),
    ]);
    const labels = await this.views.labels(items);
    return {
      ...base,
      manufacturer: {
        organizationId: organization.id,
        name: organization.name,
        partyId: organization.partyId,
        authStatus: organization.authStatus,
        orgType: organization.orgType,
      },
      items: items.map((item) => presentProduct(item, labels)),
      total,
      counts,
    };
  }
}

/** Chi tiết một sản phẩm của nhà sản xuất: hồ sơ, bằng chứng on-chain, hành trình, lịch sử event. */
@Injectable()
export class GetMyProduct {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly access: ManufacturerAccess,
    private readonly views: ProductViews,
  ) {}

  async execute(user: AuthenticatedUser, productId: string): Promise<ProductDetail> {
    const organization = await this.access.find(user);
    const product = organization
      ? (await this.products.findOwned(organization.id, [productId]))[0]
      : undefined;
    if (!organization || !product) {
      throw new ProductNotFoundError();
    }
    const [proof, timeline] = await Promise.all([
      this.views.proof(product, organization.partyId),
      this.views.timeline(product, null),
    ]);
    return {
      ...presentProduct(product, timeline.labels),
      description: product.description,
      issuer: organizationLabel(organization),
      proof,
      warranty: timeline.warranty,
      journey: timeline.journey,
      history: timeline.history,
    };
  }
}

/** DST-01: nhà bán lẻ đã được duyệt để nhà sản xuất chọn khi gửi hàng. */
@Injectable()
export class ListRetailers {
  constructor(
    private readonly organizations: OrganizationDirectory,
    private readonly access: ManufacturerAccess,
  ) {}

  async execute(user: AuthenticatedUser): Promise<RetailerOption[]> {
    await this.access.require(user);
    const retailers = await this.organizations.authorizedOfType('RETAILER');
    return retailers.map((retailer) => ({
      organizationId: retailer.id,
      name: retailer.name,
      taxCode: retailer.taxCode,
      address: retailer.address,
      partyId: retailer.partyId,
    }));
  }
}

/**
 * Tra cứu công khai bằng mã QR (không cần đăng nhập). Chỉ sản phẩm đã ghi lên blockchain mới có
 * hộ chiếu; bản nháp coi như không tồn tại. Không trả thông tin của người mua.
 */
@Injectable()
export class GetPublicPassport {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly organizations: OrganizationDirectory,
    private readonly views: ProductViews,
  ) {}

  async execute(publicCode: string): Promise<PublicPassportView> {
    const product = await this.products.findByPublicCode(publicCode);
    if (!product || isDraft(product) || !product.productState) {
      throw new ProductNotFoundError();
    }
    const issuer = (await this.organizations.describe([product.issuerOrgId])).get(
      product.issuerOrgId,
    );
    if (!issuer) {
      throw new ProductNotFoundError();
    }
    const [proof, timeline] = await Promise.all([
      this.views.proof(product, issuer.partyId),
      this.views.timeline(product, null),
    ]);
    if (!proof) {
      throw new ProductNotFoundError();
    }
    const pendingRetailer = timeline.labels.organization(product.pendingCustodianPartyId);
    return {
      publicCode: product.publicCode,
      serialNumber: product.serialNumber,
      modelName: product.modelName,
      description: product.description,
      manufacturedOn: product.manufacturedOn,
      warrantyMonths: product.warrantyMonths,
      productState: product.productState,
      issuer: {
        name: issuer.name,
        taxCode: issuer.taxCode,
        orgType: issuer.orgType,
        authStatus: issuer.authStatus,
        partyId: issuer.partyId,
      },
      holder: timeline.labels.party(product.currentCustodianPartyId),
      pendingRetailer: pendingRetailer ? { name: pendingRetailer.name } : null,
      hasOwner: product.currentOwnerPartyId !== null,
      warranty: timeline.warranty,
      proof,
      journey: timeline.journey,
      history: timeline.history,
    };
  }
}
