import { Inject, Injectable } from '@nestjs/common';
import {
  normalizeRecallReason,
  partyIdFromUuid,
  RECALL_MAX_BATCH_SIZE,
  type RecallAuthorization,
  type RecallAuthorizationView,
  recallReasonHash,
  toChecksumAddress,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { OrganizationDirectory, type OrganizationRef } from '../../organizations/index.js';
import { ProductDirectory, type ProductRef } from '../../products/index.js';
import {
  LifecycleChainNotConfiguredError,
  LifecycleWalletRequiredError,
  RecallManufacturerRequiredError,
  RecallNotAllowedError,
} from '../domain/lifecycle.errors.js';
import { isRecallable } from '../domain/recall.js';
import { LIFECYCLE_CHAIN, type LifecycleChain } from './ports/lifecycle-chain.port.js';
import { RECALL_REPOSITORY, type RecallRepository } from './ports/recall.repository.js';

/** Giấy phép thu hồi hết hạn sau 15 phút, như các giấy phép khác. */
export const RECALL_AUTHORIZATION_TTL_SECONDS = 15 * 60;

const FINAL_STATE_TEXT: Readonly<Record<string, string>> = {
  RECALLED: 'đã bị thu hồi',
  LOST_STOLEN: 'đã được báo mất',
  RETIRED: 'đã ngừng sử dụng',
};

/** Người đại diện nhà sản xuất đã duyệt, ký bằng ví cá nhân (contract kiểm tra lại). */
@Injectable()
export class RecallManufacturerAccess {
  constructor(
    private readonly organizations: OrganizationDirectory,
    private readonly identity: IdentityDirectory,
  ) {}

  async require(
    user: AuthenticatedUser,
  ): Promise<{ organization: OrganizationRef; wallet: string }> {
    const organization = await this.organizations.representedBy(user.id);
    if (organization?.orgType !== 'MANUFACTURER' || organization.authStatus !== 'AUTHORIZED') {
      throw new RecallManufacturerRequiredError();
    }
    const actor = await this.identity.actorOf(user.id);
    if (!actor?.activeWallet) {
      throw new LifecycleWalletRequiredError();
    }
    return { organization, wallet: actor.activeWallet };
  }
}

/** Mọi sản phẩm phải do nhà sản xuất này phát hành, đã lên blockchain và còn thu hồi được. */
function checkProducts(
  ids: readonly string[],
  refs: ReadonlyMap<string, ProductRef>,
  issuerOrgId: string,
): ProductRef[] {
  return ids.map((id) => {
    const product = refs.get(id);
    if (!product || product.issuerOrgId !== issuerOrgId) {
      throw new RecallNotAllowedError(
        'Có sản phẩm không thuộc doanh nghiệp của bạn hoặc chưa ghi lên blockchain.',
      );
    }
    if (!isRecallable(product.productState)) {
      throw new RecallNotAllowedError(
        `Sản phẩm ${product.serialNumber} ${FINAL_STATE_TEXT[product.productState] ?? 'không còn thu hồi được'} nên không thu hồi được nữa.`,
      );
    }
    return product;
  });
}

/**
 * RCL-01 bước 1: nhà sản xuất chọn tối đa 50 sản phẩm và nhập lý do. API lưu lý do (recalls PENDING)
 * rồi ký giấy phép EIP-712 RecallAuthorization; ví nhà sản xuất gửi `recallProducts`.
 */
@Injectable()
export class PrepareRecall {
  constructor(
    @Inject(RECALL_REPOSITORY) private readonly recalls: RecallRepository,
    @Inject(LIFECYCLE_CHAIN) private readonly chain: LifecycleChain,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RecallManufacturerAccess)
    private readonly access: Pick<RecallManufacturerAccess, 'require'>,
    private readonly products: ProductDirectory,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    input: { productIds: readonly string[]; reason: string },
    client: ClientContext,
  ): Promise<RecallAuthorizationView> {
    const contractAddress = this.chain.contractAddress;
    if (!contractAddress) {
      throw new LifecycleChainNotConfiguredError();
    }
    const { organization, wallet } = await this.access.require(user);
    const ids = [...new Set(input.productIds)];
    if (ids.length === 0 || ids.length > RECALL_MAX_BATCH_SIZE) {
      throw new RecallNotAllowedError(
        `Mỗi lần thu hồi từ 1 đến ${RECALL_MAX_BATCH_SIZE} sản phẩm.`,
      );
    }
    const products = checkProducts(ids, await this.products.describe(ids), organization.id);
    const reason = normalizeRecallReason(input.reason);
    const reasonHash = recallReasonHash(reason);
    await this.recalls.savePending(
      products.map((product) => ({
        productId: product.id,
        issuerOrgId: organization.id,
        reason,
        reasonHash,
      })),
    );

    const authorization: RecallAuthorization = {
      issuerId: partyIdFromUuid(organization.id),
      productIds: products.map((product) => product.chainProductId),
      reasonHash,
      deadline: BigInt(
        Math.floor(this.clock.now().getTime() / 1000) + RECALL_AUTHORIZATION_TTL_SECONDS,
      ),
    };
    const signature = await this.chain.signRecall(authorization);
    await this.audit.record({
      action: AuditAction.RECALL_AUTHORIZED,
      actorUserId: user.id,
      targetType: 'organization',
      targetId: organization.id,
      metadata: { products: products.length, reasonHash },
      client,
    });
    return {
      method: 'recallProducts',
      chainId: this.chain.chainId,
      contractAddress: toChecksumAddress(contractAddress),
      wallet: toChecksumAddress(wallet),
      issuerId: authorization.issuerId,
      productIds: authorization.productIds,
      reasonHash,
      deadline: authorization.deadline.toString(),
      signature,
      products: products.map((product) => ({
        id: product.id,
        serialNumber: product.serialNumber,
        modelName: product.modelName,
      })),
    };
  }
}
