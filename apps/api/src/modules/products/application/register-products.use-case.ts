import { Inject, Injectable } from '@nestjs/common';
import {
  type ProductInput,
  productIdOf,
  productMetadataHash,
  type ProductRegistrationAuthorization,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../common/persistence/transaction-scope.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import { duplicateSerials, metadataOf, normalizeProduct } from '../domain/product.js';
import {
  DuplicateSerialInBatchError,
  ProductChainNotConfiguredError,
  SerialTakenError,
} from '../domain/products.errors.js';
import { ManufacturerAccess } from './organization-access.service.js';
import {
  PRODUCT_CHAIN,
  PUBLIC_CODE_GENERATOR,
  type ProductChain,
  type PublicCodeGenerator,
} from './ports/product-chain.port.js';
import { PRODUCT_REPOSITORY, type ProductRepository } from './ports/product.repository.js';
import { ProductAuthorizer } from './product-authorizer.service.js';

/** Số lần sinh lại mã QR khi trùng; với 60 bit ngẫu nhiên gần như không bao giờ cần tới. */
const PUBLIC_CODE_ATTEMPTS = 5;

/**
 * PRD-01 (từng sản phẩm) và PRD-02 (lô CSV) bước 1: lưu hồ sơ thành bản nháp kèm mã QR, rồi cấp
 * giấy phép EIP-712. Ví cá nhân của người đại diện tự gửi registerProducts; Indexer chốt khi finalized.
 */
@Injectable()
export class RegisterProducts {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_CHAIN) private readonly chain: ProductChain,
    @Inject(PUBLIC_CODE_GENERATOR) private readonly codes: PublicCodeGenerator,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly access: ManufacturerAccess,
    private readonly authorizer: ProductAuthorizer,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    inputs: readonly ProductInput[],
    client: ClientContext,
  ): Promise<ProductRegistrationAuthorization> {
    if (!this.chain.contractAddress) {
      throw new ProductChainNotConfiguredError();
    }
    const actor = await this.access.require(user);
    const { organization } = actor;
    const normalized = inputs.map(normalizeProduct);
    const duplicates = duplicateSerials(normalized);
    if (duplicates.length > 0) {
      throw new DuplicateSerialInBatchError(duplicates);
    }
    const taken = await this.products.serialsTaken(
      organization.id,
      normalized.map((product) => product.serialNumber),
    );
    if (taken.length > 0) {
      throw new SerialTakenError(taken);
    }

    const publicCodes = await this.uniquePublicCodes(normalized.length);
    const drafts = await this.unitOfWork.run((scope) =>
      this.products.createDrafts(
        normalized.map((product, index) => ({
          ...product,
          issuerOrgId: organization.id,
          chainProductId: productIdOf(organization.partyId, product.serialNumber),
          metadataHash: productMetadataHash(metadataOf(product, organization.partyId)),
          publicCode: publicCodes[index] ?? '',
        })),
        scope,
      ),
    );
    const authorization = await this.authorizer.authorize(actor, drafts);
    await this.audit.record({
      action: AuditAction.PRODUCT_REGISTRATION_AUTHORIZED,
      actorUserId: user.id,
      targetType: 'organization',
      targetId: organization.id,
      metadata: {
        count: drafts.length,
        serials: drafts.map((draft) => draft.serialNumber).join(','),
      },
      client,
    });
    return authorization;
  }

  private async uniquePublicCodes(count: number): Promise<string[]> {
    const codes = new Set<string>();
    for (let attempt = 0; attempt < PUBLIC_CODE_ATTEMPTS && codes.size < count; attempt += 1) {
      const fresh = new Set<string>();
      while (fresh.size < count - codes.size) {
        const code = this.codes.next();
        if (!codes.has(code)) {
          fresh.add(code);
        }
      }
      const taken = new Set(await this.products.publicCodesTaken([...fresh]));
      for (const code of fresh) {
        if (!taken.has(code)) {
          codes.add(code);
        }
      }
    }
    if (codes.size < count) {
      throw new Error('Không sinh được mã QR không trùng sau nhiều lần thử');
    }
    return [...codes].slice(0, count);
  }
}
