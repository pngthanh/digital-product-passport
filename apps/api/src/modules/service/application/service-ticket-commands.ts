import { Inject, Injectable } from '@nestjs/common';
import {
  normalizeBytes32,
  normalizeText,
  partyIdFromUuid,
  SERVICE_CENTER_TICKET_METHODS,
  SERVICE_TICKET_MANAGER_CONTRACT_NAME,
  type EvidenceMimeType,
  type ServiceActionCode,
  serviceEvidenceHash,
  type ServiceTicketClosing,
  type ServiceTicketOpening,
  type ServiceTicketOpeningAuthorization,
  toChecksumAddress,
  type TrackedTransactionView,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import {
  checkEvidence,
  evidenceKey,
  mimeTypeOfKey,
  type UploadedEvidence,
} from '../../../common/files/evidence-file.js';
import { FILE_STORAGE, type FileStorage } from '../../../common/files/file-storage.js';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import { TRANSACTION_TRACKING, type TransactionTracking } from '../../chain-sync/index.js';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { ProductDirectory } from '../../products/index.js';
import { type ServiceRequestRecord, ticketIdOf } from '../domain/service-request.js';
import {
  ServiceChainNotConfiguredError,
  ServiceEvidenceNotFoundError,
  ServiceProductNotOwnedError,
  ServiceRequestNotFoundError,
  ServiceRequestStateError,
} from '../domain/service.errors.js';
import {
  SERVICE_REQUEST_REPOSITORY,
  type ServiceRequestRepository,
} from './ports/service-request.repository.js';
import {
  SERVICE_TICKET_CHAIN,
  type ServiceTicketChain,
} from './ports/service-ticket-chain.port.js';
import { type ServiceCenterActor, ServiceCenterAccess } from './service-center-access.service.js';
import { displayedRecord } from './service-views.js';

/** Giấy phép mở phiếu hết hạn sau 15 phút, như giấy phép đăng ký và bán sản phẩm. */
export const SERVICE_AUTHORIZATION_TTL_SECONDS = 15 * 60;

/** Phiếu của đúng trung tâm, kèm địa chỉ contract đã cấu hình. */
async function centerTicket(
  chain: ServiceTicketChain,
  access: ServiceCenterAccess,
  requests: ServiceRequestRepository,
  user: AuthenticatedUser,
  requestId: string,
): Promise<{ actor: ServiceCenterActor; request: ServiceRequestRecord; contractAddress: string }> {
  const contractAddress = chain.contractAddress;
  if (!contractAddress) {
    throw new ServiceChainNotConfiguredError();
  }
  const actor = await access.require(user);
  const request = await requests.findById(requestId);
  if (!request || request.serviceCenterOrgId !== actor.organization.id) {
    throw new ServiceRequestNotFoundError();
  }
  return { actor, request, contractAddress };
}

/**
 * SVC-03 bước 1: trung tâm tiếp nhận yêu cầu. API kiểm tra yêu cầu còn chờ, sản phẩm vẫn thuộc
 * người gửi rồi ký giấy phép EIP-712 ServiceTicketOpening; ví trung tâm tự gửi openTicket.
 */
@Injectable()
export class PrepareTicketOpening {
  constructor(
    @Inject(SERVICE_REQUEST_REPOSITORY) private readonly requests: ServiceRequestRepository,
    @Inject(SERVICE_TICKET_CHAIN) private readonly chain: ServiceTicketChain,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly access: ServiceCenterAccess,
    private readonly products: ProductDirectory,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    requestId: string,
    client: ClientContext,
  ): Promise<ServiceTicketOpeningAuthorization> {
    const { actor, request, contractAddress } = await centerTicket(
      this.chain,
      this.access,
      this.requests,
      user,
      requestId,
    );
    if (request.serviceState !== 'REQUESTED') {
      throw new ServiceRequestStateError(
        'Yêu cầu không còn chờ tiếp nhận (đã mở phiếu hoặc chủ sở hữu đã huỷ). Tải lại trang.',
      );
    }
    const product = await this.products.findById(request.productId);
    if (
      !product ||
      product.productState !== 'SOLD' ||
      product.currentOwnerPartyId !== request.requestedByPartyId
    ) {
      throw new ServiceProductNotOwnedError();
    }

    const opening: ServiceTicketOpening = {
      ticketId: ticketIdOf(request.id),
      productId: product.chainProductId,
      serviceCenterId: actor.organization.partyId,
      requesterId: partyIdFromUuid(request.requestedByPartyId),
      deadline: BigInt(
        Math.floor(this.clock.now().getTime() / 1000) + SERVICE_AUTHORIZATION_TTL_SECONDS,
      ),
    };
    const signature = await this.chain.signOpening(opening);
    await this.audit.record({
      action: AuditAction.SERVICE_OPENING_AUTHORIZED,
      actorUserId: user.id,
      targetType: 'service_request',
      targetId: request.id,
      metadata: { productId: product.id, serviceCenterOrgId: actor.organization.id },
      client,
    });
    return {
      method: 'openTicket',
      chainId: this.chain.chainId,
      contractAddress: toChecksumAddress(contractAddress),
      wallet: toChecksumAddress(actor.wallet),
      ticketId: opening.ticketId,
      productId: opening.productId,
      serviceCenterId: opening.serviceCenterId,
      requesterId: opening.requesterId,
      deadline: opening.deadline.toString(),
      signature,
    };
  }
}

export interface ServiceResultInput {
  repaired: boolean;
  actionCode: ServiceActionCode;
  actionDetail: string | null;
}

/**
 * SVC-04 bước 1: trung tâm nhập kết quả và tải file biên bản (không bắt buộc). API lưu file, lưu
 * biên bản PENDING và trả hash biên bản; ví trung tâm gửi closeTicket với đúng hash đó.
 */
@Injectable()
export class PrepareTicketClosing {
  constructor(
    @Inject(SERVICE_REQUEST_REPOSITORY) private readonly requests: ServiceRequestRepository,
    @Inject(SERVICE_TICKET_CHAIN) private readonly chain: ServiceTicketChain,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly access: ServiceCenterAccess,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    requestId: string,
    input: ServiceResultInput,
    upload: UploadedEvidence | undefined,
    client: ClientContext,
  ): Promise<ServiceTicketClosing> {
    const { actor, request, contractAddress } = await centerTicket(
      this.chain,
      this.access,
      this.requests,
      user,
      requestId,
    );
    if (request.serviceState !== 'IN_REPAIR') {
      throw new ServiceRequestStateError(
        'Phiếu chưa mở hoặc đã đóng nên không ghi kết quả được. Tải lại trang.',
      );
    }
    const file = upload ? checkEvidence(upload) : null;
    const evidenceUrl = file ? evidenceKey('service-evidence', request.id, file) : null;
    if (file && evidenceUrl) {
      await this.storage.save(evidenceUrl, file.content);
    }
    const ticketId = ticketIdOf(request.id);
    const actionDetail = normalizeText(input.actionDetail);
    const evidenceHash = serviceEvidenceHash({
      ticketId,
      repaired: input.repaired,
      actionCode: input.actionCode,
      actionDetail,
      file: file && { sha256: file.sha256, mimeType: file.mimeType },
    });
    await this.requests.savePendingRecord({
      serviceRequestId: request.id,
      actionCode: input.actionCode,
      actionDetail,
      evidenceUrl,
      evidenceHash,
    });
    await this.audit.record({
      action: AuditAction.SERVICE_RESULT_PREPARED,
      actorUserId: user.id,
      targetType: 'service_request',
      targetId: request.id,
      metadata: { repaired: input.repaired, actionCode: input.actionCode, evidenceHash },
      client,
    });
    return {
      method: 'closeTicket',
      chainId: this.chain.chainId,
      contractAddress: toChecksumAddress(contractAddress),
      wallet: toChecksumAddress(actor.wallet),
      ticketId,
      repaired: input.repaired,
      evidenceHash,
    };
  }
}

/**
 * Web báo txHash sau khi ví trung tâm gửi openTicket hoặc closeTicket. API kiểm tra đúng ví, đúng
 * contract, đúng hàm rồi theo dõi tới khi finalized; Indexer vẫn chiếu nếu web không kịp báo.
 */
@Injectable()
export class RecordServiceTransaction {
  constructor(
    @Inject(TRANSACTION_TRACKING) private readonly tracker: TransactionTracking,
    private readonly access: ServiceCenterAccess,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    txHash: string,
    client: ClientContext,
  ): Promise<TrackedTransactionView> {
    const { organization, wallet } = await this.access.require(user);
    const normalizedHash = normalizeBytes32(txHash);
    const status = await this.tracker.track({
      txHash: normalizedHash,
      contractName: SERVICE_TICKET_MANAGER_CONTRACT_NAME,
      expectedFrom: wallet,
      expectedMethods: [...SERVICE_CENTER_TICKET_METHODS],
      initiatedByUserId: user.id,
    });
    await this.audit.record({
      action: AuditAction.SERVICE_TRANSACTION_SUBMITTED,
      actorUserId: user.id,
      targetType: 'organization',
      targetId: organization.id,
      metadata: { txHash: normalizedHash },
      client,
    });
    return { txHash: normalizedHash, status };
  }
}

export interface EvidenceDownload {
  content: Buffer;
  mimeType: EvidenceMimeType;
  fileName: string;
}

/**
 * File biên bản chỉ trung tâm của phiếu và chủ sở hữu đã gửi yêu cầu tải được; hộ chiếu công khai
 * chỉ có hash on-chain.
 */
@Injectable()
export class GetServiceEvidence {
  constructor(
    @Inject(SERVICE_REQUEST_REPOSITORY) private readonly requests: ServiceRequestRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly access: ServiceCenterAccess,
    private readonly identity: IdentityDirectory,
  ) {}

  async execute(user: AuthenticatedUser, requestId: string): Promise<EvidenceDownload> {
    const request = await this.requests.findById(requestId);
    if (!request) {
      throw new ServiceRequestNotFoundError();
    }
    const [center, actor] = await Promise.all([
      this.access.find(user),
      this.identity.actorOf(user.id),
    ]);
    const isCenter = center?.id === request.serviceCenterOrgId;
    const isRequester = actor?.partyId === request.requestedByPartyId;
    if (!isCenter && !isRequester) {
      throw new ServiceRequestNotFoundError();
    }
    const records = (await this.requests.recordsOf([request.id])).get(request.id) ?? [];
    const record = displayedRecord(records, isCenter);
    const key = record?.evidenceUrl ?? null;
    const mimeType = key ? mimeTypeOfKey(key) : null;
    const content = key ? await this.storage.read(key) : null;
    if (!key || !mimeType || !content) {
      throw new ServiceEvidenceNotFoundError();
    }
    const extension = key.split('.').at(-1) ?? 'bin';
    return { content, mimeType, fileName: `bien-ban-${request.id.slice(0, 8)}.${extension}` };
  }
}
