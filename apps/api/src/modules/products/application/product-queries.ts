import { Inject, Injectable } from '@nestjs/common';
import {
  type MyProductList,
  type ProductDetail,
  type ProductListFilter,
  type PublicPassportView,
  toChecksumAddress,
} from '@dpp/shared';
import type { AuthenticatedUser } from '../../identity/index.js';
import { OrganizationDirectory } from '../../organizations/index.js';
import { isDraft } from '../domain/product.js';
import { ProductNotFoundError } from '../domain/products.errors.js';
import { ManufacturerAccess } from './manufacturer-access.service.js';
import { PRODUCT_CHAIN, type ProductChain } from './ports/product-chain.port.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';
import { presentProduct, ProductViews } from './product-views.js';

const EMPTY_COUNTS: Record<ProductListFilter, number> = { ALL: 0, REGISTERED: 0, DRAFT: 0 };

export interface MyProductListQuery {
  filter: ProductListFilter;
  search: string | null;
  page: number;
  pageSize: number;
}

/** Danh sách sản phẩm của nhà sản xuất mà người dùng đại diện, mới nhất trước. */
@Injectable()
export class ListMyProducts {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_CHAIN) private readonly chain: ProductChain,
    private readonly access: ManufacturerAccess,
  ) {}

  async execute(user: AuthenticatedUser, query: MyProductListQuery): Promise<MyProductList> {
    const organization = await this.access.find(user);
    const contract = this.chain.contractAddress
      ? { chainId: this.chain.chainId, address: toChecksumAddress(this.chain.contractAddress) }
      : null;
    const base = { contract, page: query.page, pageSize: query.pageSize };
    if (!organization) {
      return { ...base, manufacturer: null, items: [], total: 0, counts: EMPTY_COUNTS };
    }
    const [{ items, total }, counts] = await Promise.all([
      this.products.list(organization.id, query),
      this.products.counts(organization.id),
    ]);
    return {
      ...base,
      manufacturer: {
        organizationId: organization.id,
        name: organization.name,
        partyId: organization.partyId,
        authStatus: organization.authStatus,
        orgType: organization.orgType,
      },
      items: items.map(presentProduct),
      total,
      counts,
    };
  }
}

/** Chi tiết một sản phẩm của nhà sản xuất: hồ sơ, bằng chứng on-chain, lịch sử event. */
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
    const [proof, history] = await Promise.all([
      this.views.proof(product, organization),
      this.views.history(product),
    ]);
    return {
      ...presentProduct(product),
      description: product.description,
      issuer: {
        organizationId: organization.id,
        name: organization.name,
        partyId: organization.partyId,
      },
      proof,
      history,
    };
  }
}

/**
 * Tra cứu công khai bằng mã QR (không cần đăng nhập). Chỉ sản phẩm đã ghi lên blockchain mới có
 * hộ chiếu; bản nháp coi như không tồn tại.
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
    const custodianId = product.currentCustodianPartyId;
    const directory = await this.organizations.describe(
      custodianId ? [product.issuerOrgId, custodianId] : [product.issuerOrgId],
    );
    const issuer = directory.get(product.issuerOrgId);
    if (!issuer) {
      throw new ProductNotFoundError();
    }
    const [proof, history] = await Promise.all([
      this.views.proof(product, issuer),
      this.views.history(product),
    ]);
    if (!proof) {
      throw new ProductNotFoundError();
    }
    // Party của tổ chức dùng chung UUID với organizations; bên giữ là cá nhân thì không hiện tên.
    const custodian = custodianId ? directory.get(custodianId) : undefined;
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
      custodian: custodian ? { name: custodian.name } : null,
      proof,
      history,
    };
  }
}
