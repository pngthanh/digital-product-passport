import { Inject, Injectable } from '@nestjs/common';
import {
  type ContractInfo,
  type OwnedProductTransfer,
  partyIdFromUuid,
  toChecksumAddress,
  TRANSFER_MAX_DAYS,
  type TransferAuthorization,
  type TransferRecipientPreview,
  type TransferRequestAuthorization,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import {
  OwnerParties,
  type OwnerPartySet,
  ProductDirectory,
  type ProductRef,
} from '../../products/index.js';
import { ServiceOwnerChange } from '../../service/index.js';
import { isPending } from '../domain/transfer-request.js';
import {
  TransferChainNotConfiguredError,
  TransferNotAllowedError,
  TransferProductNotFoundError,
  TransferRecipientInvalidError,
  TransferWalletRequiredError,
} from '../domain/transfer.errors.js';
import { TRANSFER_CHAIN, type TransferChain } from './ports/transfer-chain.port.js';
import {
  TRANSFER_REQUEST_REPOSITORY,
  type TransferRequestRepository,
} from './ports/transfer-request.repository.js';
import { RecipientResolver, type ResolvedRecipient } from './recipient-resolver.js';
import { TransferViews } from './transfer-views.js';

/** Giấy phép tạo yêu cầu hết hạn sau 15 phút, như các giấy phép khác. */
export const TRANSFER_AUTHORIZATION_TTL_SECONDS = 15 * 60;

const DAY_SECONDS = 24 * 60 * 60;

export function transferContractInfo(chain: TransferChain): ContractInfo | null {
  return chain.contractAddress
    ? { chainId: chain.chainId, address: toChecksumAddress(chain.contractAddress) }
    : null;
}

interface OwnerContext {
  owners: OwnerPartySet;
  /** UUID Party đang sở hữu sản phẩm (cá nhân, hoặc tổ chức người dùng đại diện). */
  ownerPartyId: string;
  product: ProductRef;
}

/** Chủ sở hữu hiện tại của sản phẩm; người khác nhận "không tìm thấy" để không lộ sản phẩm. */
@Injectable()
export class TransferOwnerAccess {
  constructor(
    private readonly owners: OwnerParties,
    private readonly products: ProductDirectory,
  ) {}

  async require(user: AuthenticatedUser, productId: string): Promise<OwnerContext> {
    const owners = await this.owners.of(user.id);
    const product = owners.partyIds.length > 0 ? await this.products.findById(productId) : null;
    const ownerPartyId = product?.currentOwnerPartyId;
    if (!product || !ownerPartyId || !owners.partyIds.includes(ownerPartyId)) {
      throw new TransferProductNotFoundError();
    }
    return { owners, ownerPartyId, product };
  }
}

/**
 * Lý do chủ sở hữu chưa tạo được yêu cầu; `null` khi tạo được. Contract kiểm tra lại tất cả, API báo
 * trước để người dùng khỏi tốn gas.
 */
async function blockedReason(input: {
  chain: TransferChain;
  context: OwnerContext;
  service: ServiceOwnerChange;
  requests: TransferRequestRepository;
  now: Date;
}): Promise<string | null> {
  const { context } = input;
  if (!input.chain.contractAddress) {
    return 'Hệ thống chưa cấu hình OwnershipTransfer nên chưa chuyển nhượng được.';
  }
  if (context.product.productState !== 'SOLD') {
    return 'Chỉ chuyển nhượng được sản phẩm đang có chủ (chưa thu hồi, báo mất hay ngừng sử dụng).';
  }
  const organization = context.owners.organization;
  if (organization?.id === context.ownerPartyId && organization.authStatus !== 'AUTHORIZED') {
    return 'Doanh nghiệp chưa được duyệt hoặc đã bị khoá nên không chuyển nhượng được.';
  }
  if (!context.owners.actor?.activeWallet) {
    return 'Liên kết ví MetaMask ở trang Tài khoản trước. Ví của bạn ký giao dịch chuyển nhượng.';
  }
  if (await input.service.isUnderRepair(context.product.id)) {
    return 'Sản phẩm đang có phiếu sửa chữa mở. Chờ trung tâm bảo hành đóng phiếu rồi mới chuyển nhượng.';
  }
  const open = await input.requests.openForProduct(context.product.id);
  if (open && isPending(open, input.now)) {
    return 'Sản phẩm đang có một yêu cầu chuyển nhượng chờ bên nhận. Huỷ yêu cầu đó trước nếu muốn chuyển cho người khác.';
  }
  return null;
}

/** Phần chuyển nhượng trên trang sản phẩm đã mua: yêu cầu đang mở và các yêu cầu đã gửi trước. */
@Injectable()
export class GetOwnedProductTransfer {
  constructor(
    @Inject(TRANSFER_REQUEST_REPOSITORY) private readonly requests: TransferRequestRepository,
    @Inject(TRANSFER_CHAIN) private readonly chain: TransferChain,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly access: TransferOwnerAccess,
    private readonly service: ServiceOwnerChange,
    private readonly views: TransferViews,
  ) {}

  async execute(user: AuthenticatedUser, productId: string): Promise<OwnedProductTransfer> {
    const context = await this.access.require(user, productId);
    const now = this.clock.now();
    const viewer = context.owners.partyIds;
    const [open, closed, reason] = await Promise.all([
      this.requests.openForProduct(context.product.id),
      this.requests.closedSentBy(context.product.id, viewer),
      blockedReason({
        chain: this.chain,
        context,
        service: this.service,
        requests: this.requests,
        now,
      }),
    ]);
    const [active] = open ? await this.views.present([open], viewer, now) : [];
    return {
      blockedReason: reason,
      contract: transferContractInfo(this.chain),
      wallet: context.owners.actor?.activeWallet ?? null,
      active: active ?? null,
      history: await this.views.present(closed, viewer, now),
    };
  }
}

/** Kiểm tra bên nhận có hợp lệ với sản phẩm này không (khác chủ hiện tại). */
function checkRecipient(context: OwnerContext, recipient: ResolvedRecipient): void {
  if (recipient.partyUuid === context.ownerPartyId) {
    throw new TransferRecipientInvalidError('Bên nhận đang là chủ sở hữu của sản phẩm này.');
  }
}

/** Tra bên nhận trước khi tạo yêu cầu, để chủ sở hữu thấy đúng tên người hoặc doanh nghiệp. */
@Injectable()
export class PreviewTransferRecipient {
  constructor(
    private readonly access: TransferOwnerAccess,
    private readonly recipients: RecipientResolver,
  ) {}

  async execute(
    user: AuthenticatedUser,
    productId: string,
    recipient: string,
  ): Promise<TransferRecipientPreview> {
    const context = await this.access.require(user, productId);
    const resolved = await this.recipients.resolve(recipient);
    checkRecipient(context, resolved);
    return {
      partyId: resolved.chainPartyId,
      party: resolved.party,
      needsWallet: resolved.needsWallet,
    };
  }
}

/**
 * TRF-01 bước 1: kiểm tra sản phẩm, bên nhận và thời hạn, rồi ký giấy phép EIP-712
 * TransferAuthorization; ví chủ sở hữu gửi createTransferRequest với đúng các giá trị đó.
 */
@Injectable()
export class PrepareTransferRequest {
  constructor(
    @Inject(TRANSFER_REQUEST_REPOSITORY) private readonly requests: TransferRequestRepository,
    @Inject(TRANSFER_CHAIN) private readonly chain: TransferChain,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly access: TransferOwnerAccess,
    private readonly service: ServiceOwnerChange,
    private readonly recipients: RecipientResolver,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    productId: string,
    input: { recipient: string; days: number },
    client: ClientContext,
  ): Promise<TransferRequestAuthorization> {
    const contractAddress = this.chain.contractAddress;
    if (!contractAddress) {
      throw new TransferChainNotConfiguredError();
    }
    const context = await this.access.require(user, productId);
    const wallet = context.owners.actor?.activeWallet;
    if (!wallet) {
      throw new TransferWalletRequiredError();
    }
    const now = this.clock.now();
    const reason = await blockedReason({
      chain: this.chain,
      context,
      service: this.service,
      requests: this.requests,
      now,
    });
    if (reason) {
      throw new TransferNotAllowedError(reason);
    }
    const recipient = await this.recipients.resolve(input.recipient);
    checkRecipient(context, recipient);
    const days = Math.min(Math.max(Math.trunc(input.days), 1), TRANSFER_MAX_DAYS);
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const authorization: TransferAuthorization = {
      productId: context.product.chainProductId,
      fromPartyId: partyIdFromUuid(context.ownerPartyId),
      toPartyId: recipient.chainPartyId,
      expiresAt: BigInt(nowSeconds + days * DAY_SECONDS),
      deadline: BigInt(nowSeconds + TRANSFER_AUTHORIZATION_TTL_SECONDS),
    };
    const signature = await this.chain.signAuthorization(authorization);
    await this.audit.record({
      action: AuditAction.TRANSFER_AUTHORIZED,
      actorUserId: user.id,
      targetType: 'product',
      targetId: context.product.id,
      metadata: { toPartyId: recipient.partyUuid, days },
      client,
    });
    return {
      method: 'createTransferRequest',
      chainId: this.chain.chainId,
      contractAddress: toChecksumAddress(contractAddress),
      wallet: toChecksumAddress(wallet),
      productId: authorization.productId,
      fromPartyId: authorization.fromPartyId,
      toPartyId: authorization.toPartyId,
      expiresAt: authorization.expiresAt.toString(),
      deadline: authorization.deadline.toString(),
      signature,
      recipient: recipient.party,
    };
  }
}
