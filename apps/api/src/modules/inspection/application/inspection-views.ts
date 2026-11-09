import { Inject, Injectable } from '@nestjs/common';
import {
  type InspectionReportView,
  type InspectionRequestView,
  inspectionReportHash,
  type OrganizationLabel,
  partyIdFromUuid,
  type PublicInspectionView,
} from '@dpp/shared';
import { mimeTypeOfKey, storedEvidence } from '../../../common/files/evidence-file.js';
import { FILE_STORAGE, type FileStorage } from '../../../common/files/file-storage.js';
import { OrganizationDirectory } from '../../organizations/index.js';
import { ProductDirectory } from '../../products/index.js';
import {
  type InspectionRequestRecord,
  type InspectionRow,
  inspectionIdOf,
  requesterRoleOf,
} from '../domain/inspection-request.js';
import {
  INSPECTION_REQUEST_REPOSITORY,
  type InspectionRequestRepository,
} from './ports/inspection-request.repository.js';

export interface PresentOptions {
  /** Phía đơn vị kiểm định thấy cả biên bản đang chờ ghi on-chain. */
  includePending: boolean;
  /** Băm lại biên bản và file để đối chiếu với hash on-chain. */
  verify: boolean;
}

/** Biên bản hiển thị: bản đã ghi on-chain, hoặc bản PENDING mới nhất nếu được phép xem. */
export function displayedInspection(
  rows: readonly InspectionRow[],
  includePending: boolean,
): InspectionRow | null {
  return (
    rows.find((row) => row.syncStatus === 'CONFIRMED') ??
    (includePending ? (rows.find((row) => row.syncStatus === 'PENDING') ?? null) : null)
  );
}

/** Dựng InspectionRequestView và PublicInspectionView: tên đơn vị, biên bản, đối chiếu hash. */
@Injectable()
export class InspectionViews {
  constructor(
    @Inject(INSPECTION_REQUEST_REPOSITORY) private readonly requests: InspectionRequestRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly organizations: OrganizationDirectory,
    private readonly products: ProductDirectory,
  ) {}

  async present(
    requests: readonly InspectionRequestRecord[],
    options: PresentOptions,
  ): Promise<InspectionRequestView[]> {
    const [inspectors, products, inspections] = await Promise.all([
      this.organizations.describe(requests.map((request) => request.inspectorOrgId)),
      this.products.describe(requests.map((request) => request.productId)),
      this.requests.inspectionsOf(requests.map((request) => request.id)),
    ]);
    return Promise.all(
      requests.map(async (request) => {
        const row = displayedInspection(inspections.get(request.id) ?? [], options.includePending);
        return {
          id: request.id,
          inspectionId: inspectionIdOf(request.id),
          state: request.requestState,
          requesterRole: requesterRoleOf(
            request,
            products.get(request.productId)?.issuerOrgId ?? '',
          ),
          note: request.note,
          inspector: this.label(request.inspectorOrgId, inspectors),
          requestedAt: request.requestedAt.toISOString(),
          closedAt: request.closedAt?.toISOString() ?? null,
          declineReason: request.declineReason,
          report: row && (await this.presentReport(request, row, options.verify)),
        };
      }),
    );
  }

  /** Kết quả đã ghi on-chain cho hộ chiếu công khai, mới nhất trước. */
  async presentPublic(
    requests: readonly InspectionRequestRecord[],
    issuerOrgId: string,
  ): Promise<PublicInspectionView[]> {
    const completed = requests.filter((request) => request.requestState === 'COMPLETED');
    const [inspectors, inspections] = await Promise.all([
      this.organizations.describe(completed.map((request) => request.inspectorOrgId)),
      this.requests.inspectionsOf(completed.map((request) => request.id)),
    ]);
    const views = await Promise.all(
      completed.map(async (request): Promise<PublicInspectionView | null> => {
        const row = displayedInspection(inspections.get(request.id) ?? [], false);
        if (!row?.inspectedAt || !row.txHash) {
          return null;
        }
        return {
          id: request.id,
          inspectionId: inspectionIdOf(request.id),
          inspector: this.label(request.inspectorOrgId, inspectors),
          requesterRole: requesterRoleOf(request, issuerOrgId),
          result: row.result,
          summary: row.summary ?? '',
          fileType: row.reportUrl ? mimeTypeOfKey(row.reportUrl) : null,
          reportHash: row.reportHash,
          inspectedAt: row.inspectedAt.toISOString(),
          txHash: row.txHash,
          matchesOnchain: await this.matches(request, row),
        };
      }),
    );
    return views
      .filter((view): view is PublicInspectionView => view !== null)
      .toSorted((a, b) => b.inspectedAt.localeCompare(a.inspectedAt));
  }

  private label(
    organizationId: string,
    organizations: ReadonlyMap<string, { name: string; partyId: string }>,
  ): OrganizationLabel {
    const organization = organizations.get(organizationId);
    return {
      organizationId,
      name: organization?.name ?? '',
      partyId: organization?.partyId ?? partyIdFromUuid(organizationId),
    };
  }

  private async presentReport(
    request: InspectionRequestRecord,
    row: InspectionRow,
    verify: boolean,
  ): Promise<InspectionReportView> {
    return {
      result: row.result,
      summary: row.summary ?? '',
      reportHash: row.reportHash,
      fileType: row.reportUrl ? mimeTypeOfKey(row.reportUrl) : null,
      inspectedAt: row.inspectedAt?.toISOString() ?? null,
      txHash: row.txHash,
      syncStatus: row.syncStatus,
      matchesOnchain:
        verify && row.syncStatus === 'CONFIRMED' ? await this.matches(request, row) : null,
    };
  }

  /**
   * Băm lại biên bản đang lưu (tóm tắt trong CSDL, file trong kho) theo kết quả đã ghi; hash on-chain
   * đã được Worker đối chiếu khi chiếu InspectionRecorded.
   */
  private async matches(request: InspectionRequestRecord, row: InspectionRow): Promise<boolean> {
    const file = await storedEvidence(this.storage, row.reportUrl);
    if (file === 'missing') {
      return false;
    }
    return (
      inspectionReportHash({
        inspectionId: inspectionIdOf(request.id),
        result: row.result,
        summary: row.summary ?? '',
        file,
      }) === row.reportHash
    );
  }
}
