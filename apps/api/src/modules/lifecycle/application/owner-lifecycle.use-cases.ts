import { Inject, Injectable } from '@nestjs/common';
import {
  type ContractInfo,
  normalizeBytes32,
  OWNER_LIFECYCLE_METHODS,
  type OwnedProductLifecycle,
  PRODUCT_LIFECYCLE_CONTRACT_NAME,
  PRODUCT_LIFECYCLE_METHODS,
  type PublicLifecycleView,
  toChecksumAddress,
  type TrackedTransactionView,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { TRANSACTION_TRACKING, type TransactionTracking } from '../../chain-sync/index.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import { OwnerParties, type OwnerPartySet, ProductDirectory } from '../../products/index.js';
import { ServiceOwnerChange } from '../../service/index.js';
import {
  LifecycleProductNotFoundError,
  LifecycleWalletRequiredError,
} from '../domain/lifecycle.errors.js';
import { LifecycleNotices } from './lifecycle-notices.js';
import { LIFECYCLE_CHAIN, type LifecycleChain } from './ports/lifecycle-chain.port.js';

export function lifecycleContractInfo(chain: LifecycleChain): ContractInfo | null {
  return chain.contractAddress
    ? { chainId: chain.chainId, address: toChecksumAddress(chain.contractAddress) }
    : null;
}

/** Lý do chủ sở hữu chưa báo mất, ngừng sử dụng được; `null` khi làm được. Contract kiểm tra lại. */
async function blockedReason(input: {
  chain: LifecycleChain;
  owners: OwnerPartySet;
  ownerPartyId: string;
  productId: string;
  service: ServiceOwnerChange;
}): Promise<string | null> {
  if (!input.chain.contractAddress) {
    return 'Hệ thống chưa cấu hình ProductLifecycle nên chưa báo mất, ngừng sử dụng được.';
  }
  const organization = input.owners.organization;
  if (organization?.id === input.ownerPartyId && organization.authStatus !== 'AUTHORIZED') {
    return 'Doanh nghiệp chưa được duyệt hoặc đã bị khoá nên chưa thao tác được.';
  }
  if (!input.owners.actor?.activeWallet) {
    return 'Liên kết ví MetaMask ở trang Tài khoản trước. Ví của bạn ký giao dịch này.';
  }
  if (await input.service.isUnderRepair(input.productId)) {
    return 'Sản phẩm đang ở trung tâm bảo hành (phiếu sửa chữa đang mở). Chờ trung tâm đóng phiếu rồi mới báo mất hay ngừng sử dụng.';
  }
  return null;
}

/** LIF-01, LIF-02: khung báo mất, ngừng sử dụng trên trang sản phẩm đã mua. */
@Injectable()
export class GetOwnedProductLifecycle {
  constructor(
    @Inject(LIFECYCLE_CHAIN) private readonly chain: LifecycleChain,
    private readonly owners: OwnerParties,
    private readonly products: ProductDirectory,
    private readonly service: ServiceOwnerChange,
    private readonly notices: LifecycleNotices,
  ) {}

  async execute(user: AuthenticatedUser, productId: string): Promise<OwnedProductLifecycle> {
    const owners = await this.owners.of(user.id);
    const product = owners.partyIds.length > 0 ? await this.products.findById(productId) : null;
    const ownerPartyId = product?.currentOwnerPartyId;
    if (!product || !ownerPartyId || !owners.partyIds.includes(ownerPartyId)) {
      throw new LifecycleProductNotFoundError();
    }
    const notice = await this.notices.of(product);
    return {
      notice,
      blockedReason: notice
        ? 'Sản phẩm đã ở trạng thái cuối, không đổi được nữa.'
        : await blockedReason({
            chain: this.chain,
            owners,
            ownerPartyId,
            productId: product.id,
            service: this.service,
          }),
      contract: lifecycleContractInfo(this.chain),
      wallet: owners.actor?.activeWallet ?? null,
      chainProductId: product.chainProductId,
      methods: [...OWNER_LIFECYCLE_METHODS],
    };
  }
}

/** Hộ chiếu công khai: thu hồi (kèm lý do), báo mất hay ngừng sử dụng; không lộ chủ sở hữu. */
@Injectable()
export class GetPublicLifecycle {
  constructor(
    private readonly products: ProductDirectory,
    private readonly notices: LifecycleNotices,
  ) {}

  async execute(publicCode: string): Promise<PublicLifecycleView> {
    const product = await this.products.findByPublicCode(publicCode);
    if (!product) {
      throw new LifecycleProductNotFoundError();
    }
    return { notice: await this.notices.of(product) };
  }
}

/**
 * Web báo txHash sau khi ví gửi một hàm của ProductLifecycle (thu hồi, báo mất, ngừng sử dụng). API
 * kiểm tra đúng ví, đúng contract, đúng hàm rồi theo dõi tới khi finalized; Indexer vẫn chiếu nếu
 * web không kịp báo.
 */
@Injectable()
export class RecordLifecycleTransaction {
  constructor(
    @Inject(TRANSACTION_TRACKING) private readonly tracker: TransactionTracking,
    private readonly owners: OwnerParties,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    txHash: string,
    client: ClientContext,
  ): Promise<TrackedTransactionView> {
    const { actor } = await this.owners.of(user.id);
    if (!actor?.activeWallet) {
      throw new LifecycleWalletRequiredError();
    }
    const normalizedHash = normalizeBytes32(txHash);
    const status = await this.tracker.track({
      txHash: normalizedHash,
      contractName: PRODUCT_LIFECYCLE_CONTRACT_NAME,
      expectedFrom: actor.activeWallet,
      expectedMethods: [...PRODUCT_LIFECYCLE_METHODS],
      initiatedByUserId: user.id,
    });
    await this.audit.record({
      action: AuditAction.LIFECYCLE_TRANSACTION_SUBMITTED,
      actorUserId: user.id,
      targetType: 'party',
      targetId: actor.partyId,
      metadata: { txHash: normalizedHash },
      client,
    });
    return { txHash: normalizedHash, status };
  }
}
