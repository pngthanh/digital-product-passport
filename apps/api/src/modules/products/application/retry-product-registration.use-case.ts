import { Inject, Injectable } from '@nestjs/common';
import type { ProductRegistrationAuthorization } from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import { isDraft, type ProductRecord } from '../domain/product.js';
import {
  ProductAlreadyOnChainError,
  ProductChainReadFailedError,
  ProductNotFoundError,
} from '../domain/products.errors.js';
import { ManufacturerAccess } from './organization-access.service.js';
import { PRODUCT_CHAIN, type ProductChain } from './ports/product-chain.port.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';
import { ProductAuthorizer } from './product-authorizer.service.js';

/** Bản nháp nào đã có trên chain (giao dịch trước đã thành công, Indexer chưa kịp chốt). */
export async function draftsAlreadyOnChain(
  chain: ProductChain,
  drafts: readonly ProductRecord[],
): Promise<ProductRecord[]> {
  try {
    const onchain = await Promise.all(
      drafts.map((draft) => chain.readProduct(draft.chainProductId)),
    );
    return drafts.filter((_, index) => onchain[index] !== null);
  } catch {
    throw new ProductChainReadFailedError();
  }
}

/**
 * Gửi lại các bản nháp chưa ghi lên blockchain (ví từ chối ký, giấy phép hết hạn...): cấp giấy phép
 * mới cho đúng hồ sơ đã lưu, không tạo bản nháp mới.
 */
@Injectable()
export class RetryProductRegistration {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_CHAIN) private readonly chain: ProductChain,
    private readonly access: ManufacturerAccess,
    private readonly authorizer: ProductAuthorizer,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    productIds: readonly string[],
    client: ClientContext,
  ): Promise<ProductRegistrationAuthorization> {
    const actor = await this.access.require(user);
    const ids = [...new Set(productIds)];
    const found = await this.products.findOwned(actor.organization.id, ids);
    const byId = new Map(found.map((product) => [product.id, product]));
    const drafts = ids.map((id) => byId.get(id));
    if (drafts.some((draft) => draft === undefined)) {
      throw new ProductNotFoundError();
    }
    const ordered = drafts.filter((draft): draft is ProductRecord => draft !== undefined);
    const registered = ordered.filter((draft) => !isDraft(draft));
    const inFlight = await draftsAlreadyOnChain(this.chain, ordered.filter(isDraft));
    const blocked = [...registered, ...inFlight];
    if (blocked.length > 0) {
      throw new ProductAlreadyOnChainError(blocked.map((product) => product.serialNumber));
    }

    const authorization = await this.authorizer.authorize(actor, ordered);
    await this.audit.record({
      action: AuditAction.PRODUCT_REGISTRATION_AUTHORIZED,
      actorUserId: user.id,
      targetType: 'organization',
      targetId: actor.organization.id,
      metadata: {
        count: ordered.length,
        retry: true,
        serials: ordered.map((draft) => draft.serialNumber).join(','),
      },
      client,
    });
    return authorization;
  }
}
