import { Inject, Injectable } from '@nestjs/common';
import {
  type OrganizationLabel,
  partyIdFromUuid,
  type ServiceRecordView,
  type ServiceRequestView,
  serviceEvidenceHash,
} from '@dpp/shared';
import { mimeTypeOfKey, storedEvidence } from '../../../common/files/evidence-file.js';
import { FILE_STORAGE, type FileStorage } from '../../../common/files/file-storage.js';
import { OrganizationDirectory } from '../../organizations/index.js';
import {
  type ServiceRecordRow,
  type ServiceRequestRecord,
  ticketIdOf,
} from '../domain/service-request.js';
import {
  SERVICE_REQUEST_REPOSITORY,
  type ServiceRequestRepository,
} from './ports/service-request.repository.js';

export interface PresentOptions {
  /** Phía trung tâm thấy cả biên bản đang chờ ghi on-chain. */
  includePending: boolean;
  /** Băm lại biên bản và file để đối chiếu với hash on-chain (chỉ ở trang chi tiết). */
  verify: boolean;
}

/** Biên bản hiển thị: bản đã ghi on-chain, hoặc bản PENDING mới nhất nếu được phép xem. */
export function displayedRecord(
  records: readonly ServiceRecordRow[],
  includePending: boolean,
): ServiceRecordRow | null {
  return (
    records.find((record) => record.syncStatus === 'CONFIRMED') ??
    (includePending ? (records.find((record) => record.syncStatus === 'PENDING') ?? null) : null)
  );
}

/** Dựng ServiceRequestView: tên trung tâm, biên bản và kết quả đối chiếu hash. */
@Injectable()
export class ServiceViews {
  constructor(
    @Inject(SERVICE_REQUEST_REPOSITORY) private readonly requests: ServiceRequestRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly organizations: OrganizationDirectory,
  ) {}

  async present(
    requests: readonly ServiceRequestRecord[],
    options: PresentOptions,
  ): Promise<ServiceRequestView[]> {
    const [centers, records] = await Promise.all([
      this.organizations.describe(requests.map((request) => request.serviceCenterOrgId)),
      this.requests.recordsOf(requests.map((request) => request.id)),
    ]);
    return Promise.all(
      requests.map(async (request) => {
        const center = centers.get(request.serviceCenterOrgId);
        const serviceCenter: OrganizationLabel = {
          organizationId: request.serviceCenterOrgId,
          name: center?.name ?? '',
          partyId: center?.partyId ?? partyIdFromUuid(request.serviceCenterOrgId),
        };
        const record = displayedRecord(records.get(request.id) ?? [], options.includePending);
        return {
          id: request.id,
          ticketId: ticketIdOf(request.id),
          state: request.serviceState,
          issueDesc: request.issueDesc,
          serviceCenter,
          requestedAt: request.requestedAt.toISOString(),
          cancelledAt: request.cancelledAt?.toISOString() ?? null,
          warrantyCovered: request.warrantyCovered,
          openedAt: request.openedAt?.toISOString() ?? null,
          closedAt: request.closedAt?.toISOString() ?? null,
          openTxHash: request.openTxHash,
          closeTxHash: request.closeTxHash,
          record: record && (await this.presentRecord(request, record, options.verify)),
        };
      }),
    );
  }

  private async presentRecord(
    request: ServiceRequestRecord,
    record: ServiceRecordRow,
    verify: boolean,
  ): Promise<ServiceRecordView> {
    const closed = request.serviceState === 'REPAIRED' || request.serviceState === 'REJECTED';
    return {
      actionCode: record.actionCode,
      actionDetail: record.actionDetail,
      evidenceHash: record.evidenceHash,
      fileType: record.evidenceUrl ? mimeTypeOfKey(record.evidenceUrl) : null,
      recordedAt: record.recordedAt?.toISOString() ?? null,
      txHash: record.txHash,
      syncStatus: record.syncStatus,
      matchesOnchain:
        verify && closed && record.syncStatus === 'CONFIRMED'
          ? await this.matches(request, record)
          : null,
    };
  }

  /**
   * Băm lại biên bản đang lưu (nội dung trong CSDL, file trong kho) theo kết quả đã ghi on-chain;
   * hash on-chain đã được Worker đối chiếu khi chiếu ServiceTicketClosed.
   */
  private async matches(request: ServiceRequestRecord, record: ServiceRecordRow): Promise<boolean> {
    const file = await storedEvidence(this.storage, record.evidenceUrl);
    if (file === 'missing') {
      return false;
    }
    return (
      serviceEvidenceHash({
        ticketId: ticketIdOf(request.id),
        repaired: request.serviceState === 'REPAIRED',
        actionCode: record.actionCode,
        actionDetail: record.actionDetail,
        file,
      }) === record.evidenceHash
    );
  }
}
