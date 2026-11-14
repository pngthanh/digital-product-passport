import { Inject, Injectable } from '@nestjs/common';
import {
  encodeChainEnum,
  type EvidenceMimeType,
  INSPECTION_REGISTRY_CONTRACT_NAME,
  type InspectionRecord,
  type InspectionRecordAuthorization,
  type InspectionResult,
  inspectionReportHash,
  INSPECTOR_METHODS,
  normalizeBytes32,
  normalizeText,
  partyIdFromUuid,
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
import type { AuthenticatedUser } from '../../identity/index.js';
import { Notifier } from '../../notifications/index.js';
import { ProductDirectory } from '../../products/index.js';
import {
  type InspectionRequestRecord,
  inspectionIdOf,
  requesterStillAllowed,
} from '../domain/inspection-request.js';
import {
  InspectionChainNotConfiguredError,
  InspectionReportNotFoundError,
  InspectionRequesterChangedError,
  InspectionRequestNotFoundError,
  InspectionRequestStateError,
} from '../domain/inspection.errors.js';
import { displayedInspection } from './inspection-views.js';
import { type InspectorActor, InspectorAccess } from './inspector-access.service.js';
import { INSPECTION_CHAIN, type InspectionChain } from './ports/inspection-chain.port.js';
import {
  INSPECTION_REQUEST_REPOSITORY,
  type InspectionRequestRepository,
} from './ports/inspection-request.repository.js';

/** Giấy phép ghi kết quả hết hạn sau 15 phút, như giấy phép đăng ký, bán và mở phiếu sửa. */
export const INSPECTION_AUTHORIZATION_TTL_SECONDS = 15 * 60;

const PENDING_ONLY =
  'Yêu cầu không còn chờ kiểm định (đã có kết quả, bị từ chối hoặc người gửi đã huỷ). Tải lại trang.';

/** Yêu cầu của đúng đơn vị kiểm định, còn đang chờ. */
async function pendingRequest(
  requests: InspectionRequestRepository,
  inspectorOrgId: string,
  requestId: string,
): Promise<InspectionRequestRecord> {
  const request = await requests.findById(requestId);
  if (!request || request.inspectorOrgId !== inspectorOrgId) {
    throw new InspectionRequestNotFoundError();
  }
  if (request.requestState !== 'REQUESTED') {
    throw new InspectionRequestStateError(PENDING_ONLY);
  }
  return request;
}

export interface InspectionResultInput {
  result: InspectionResult;
  summary: string;
}

/**
 * INS-01 bước 1: đơn vị kiểm định nhập kết quả, tóm tắt và (không bắt buộc) file biên bản. API lưu
 * file, lưu biên bản PENDING, rồi ký giấy phép EIP-712 khoá đúng kết quả và hash biên bản; ví đơn vị
 * kiểm định gửi recordInspection với đúng các giá trị đó.
 */
@Injectable()
export class PrepareInspectionRecord {
  constructor(
    @Inject(INSPECTION_REQUEST_REPOSITORY) private readonly requests: InspectionRequestRepository,
    @Inject(INSPECTION_CHAIN) private readonly chain: InspectionChain,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly access: InspectorAccess,
    private readonly products: ProductDirectory,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    requestId: string,
    input: InspectionResultInput,
    upload: UploadedEvidence | undefined,
    client: ClientContext,
  ): Promise<InspectionRecordAuthorization> {
    const contractAddress = this.chain.contractAddress;
    if (!contractAddress) {
      throw new InspectionChainNotConfiguredError();
    }
    const actor: InspectorActor = await this.access.require(user);
    const request = await pendingRequest(this.requests, actor.organization.id, requestId);
    const product = await this.products.findById(request.productId);
    if (!product || !requesterStillAllowed(request.requestedByPartyId, product)) {
      throw new InspectionRequesterChangedError();
    }

    const file = upload ? checkEvidence(upload) : null;
    const reportUrl = file ? evidenceKey('inspection-reports', request.id, file) : null;
    if (file && reportUrl) {
      await this.storage.save(reportUrl, file.content);
    }
    const inspectionId = inspectionIdOf(request.id);
    const summary = normalizeText(input.summary) ?? '';
    const reportHash = inspectionReportHash({
      inspectionId,
      result: input.result,
      summary,
      file: file && { sha256: file.sha256, mimeType: file.mimeType },
    });
    await this.requests.savePendingInspection({
      requestId: request.id,
      productId: product.id,
      inspectorOrgId: actor.organization.id,
      result: input.result,
      summary,
      reportUrl,
      reportHash,
    });

    const record: InspectionRecord = {
      inspectionId,
      productId: product.chainProductId,
      inspectorId: actor.organization.partyId,
      requesterId: partyIdFromUuid(request.requestedByPartyId),
      result: encodeChainEnum('InspectionResult', input.result),
      reportHash,
      deadline: BigInt(
        Math.floor(this.clock.now().getTime() / 1000) + INSPECTION_AUTHORIZATION_TTL_SECONDS,
      ),
    };
    const signature = await this.chain.signRecord(record);
    await this.audit.record({
      action: AuditAction.INSPECTION_RESULT_PREPARED,
      actorUserId: user.id,
      targetType: 'inspection_request',
      targetId: request.id,
      metadata: { productId: product.id, result: input.result, reportHash },
      client,
    });
    return {
      method: 'recordInspection',
      chainId: this.chain.chainId,
      contractAddress: toChecksumAddress(contractAddress),
      wallet: toChecksumAddress(actor.wallet),
      inspectionId,
      productId: record.productId,
      inspectorId: record.inspectorId,
      requesterId: record.requesterId,
      result: input.result,
      resultCode: record.result,
      reportHash,
      deadline: record.deadline.toString(),
      signature,
    };
  }
}

/** INS-04: đơn vị kiểm định từ chối yêu cầu kèm lý do (off-chain, không tốn gas). */
@Injectable()
export class DeclineInspectionRequest {
  constructor(
    @Inject(INSPECTION_REQUEST_REPOSITORY) private readonly requests: InspectionRequestRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly access: InspectorAccess,
    private readonly audit: AuditTrail,
    private readonly products: ProductDirectory,
    private readonly notifier: Notifier,
  ) {}

  async execute(
    user: AuthenticatedUser,
    requestId: string,
    reason: string,
    client: ClientContext,
  ): Promise<void> {
    const inspector = await this.access.requireOrganization(user);
    const request = await pendingRequest(this.requests, inspector.id, requestId);
    const text = normalizeText(reason) ?? '';
    if (!(await this.requests.decline(request.id, text, this.clock.now()))) {
      throw new InspectionRequestStateError(PENDING_ONLY);
    }
    await this.audit.record({
      action: AuditAction.INSPECTION_REQUEST_DECLINED,
      actorUserId: user.id,
      targetType: 'inspection_request',
      targetId: request.id,
      metadata: { productId: request.productId },
      client,
    });
    const product = await this.products.findById(request.productId);
    if (product) {
      await this.notifier.notify({
        type: 'INSPECTION_DECLINED',
        recipients: [request.requestedByPartyId],
        product,
        organizationId: inspector.id,
        reason: text,
      });
    }
  }
}

/**
 * Web báo txHash sau khi ví đơn vị kiểm định gửi recordInspection. API kiểm tra đúng ví, đúng
 * contract, đúng hàm rồi theo dõi tới khi finalized; Indexer vẫn chiếu nếu web không kịp báo.
 */
@Injectable()
export class RecordInspectionTransaction {
  constructor(
    @Inject(TRANSACTION_TRACKING) private readonly tracker: TransactionTracking,
    private readonly access: InspectorAccess,
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
      contractName: INSPECTION_REGISTRY_CONTRACT_NAME,
      expectedFrom: wallet,
      expectedMethods: [...INSPECTOR_METHODS],
      initiatedByUserId: user.id,
    });
    await this.audit.record({
      action: AuditAction.INSPECTION_TRANSACTION_SUBMITTED,
      actorUserId: user.id,
      targetType: 'organization',
      targetId: organization.id,
      metadata: { txHash: normalizedHash },
      client,
    });
    return { txHash: normalizedHash, status };
  }
}

export interface ReportDownload {
  content: Buffer;
  mimeType: EvidenceMimeType;
  fileName: string;
}

/**
 * File biên bản kiểm định. Bản đã ghi on-chain công khai (D59); bản đang chờ ghi chỉ đơn vị kiểm
 * định của yêu cầu tải được.
 */
@Injectable()
export class GetInspectionReport {
  constructor(
    @Inject(INSPECTION_REQUEST_REPOSITORY) private readonly requests: InspectionRequestRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly access: InspectorAccess,
  ) {}

  /** `user` là đơn vị kiểm định (xem cả bản chờ ghi); không truyền là hộ chiếu công khai. */
  async execute(requestId: string, user?: AuthenticatedUser): Promise<ReportDownload> {
    const request = await this.requests.findById(requestId);
    const inspector = user ? await this.access.find(user) : null;
    if (!request || (user && inspector?.id !== request.inspectorOrgId)) {
      throw new InspectionRequestNotFoundError();
    }
    const rows = (await this.requests.inspectionsOf([request.id])).get(request.id) ?? [];
    const row = displayedInspection(rows, !!user);
    const key = row?.reportUrl ?? null;
    const mimeType = key ? mimeTypeOfKey(key) : null;
    const content = key ? await this.storage.read(key) : null;
    if (!key || !mimeType || !content) {
      throw new InspectionReportNotFoundError();
    }
    const extension = key.split('.').at(-1) ?? 'bin';
    return {
      content,
      mimeType,
      fileName: `kiem-dinh-${request.id.slice(0, 8)}.${extension}`,
    };
  }
}
