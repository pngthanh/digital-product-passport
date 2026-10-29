import { Inject, Injectable } from '@nestjs/common';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import { isDraft } from '../domain/product.js';
import { ProductAlreadyOnChainError, ProductNotFoundError } from '../domain/products.errors.js';
import { ManufacturerAccess } from './manufacturer-access.service.js';
import { PRODUCT_CHAIN, type ProductChain } from './ports/product-chain.port.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';
import { draftsAlreadyOnChain } from './retry-product-registration.use-case.js';

/** Xoá bản nháp nhập nhầm. Sản phẩm đã ghi lên blockchain thì không xoá được (lịch sử là bất biến). */
@Injectable()
export class DeleteProductDraft {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_CHAIN) private readonly chain: ProductChain,
    private readonly access: ManufacturerAccess,
    private readonly audit: AuditTrail,
  ) {}

  async execute(user: AuthenticatedUser, productId: string, client: ClientContext): Promise<void> {
    const organization = await this.access.find(user);
    const product = organization
      ? (await this.products.findOwned(organization.id, [productId]))[0]
      : undefined;
    if (!organization || !product) {
      throw new ProductNotFoundError();
    }
    if (!isDraft(product) || (await draftsAlreadyOnChain(this.chain, [product])).length > 0) {
      throw new ProductAlreadyOnChainError([product.serialNumber]);
    }
    if (!(await this.products.deleteDraft(product.id))) {
      throw new ProductNotFoundError();
    }
    await this.audit.record({
      action: AuditAction.PRODUCT_DRAFT_DELETED,
      actorUserId: user.id,
      targetType: 'product',
      targetId: product.id,
      metadata: { serialNumber: product.serialNumber, organizationId: organization.id },
      client,
    });
  }
}
