import { Injectable } from '@nestjs/common';
import { partyIdFromUuid, type TransferProduct, type TransferRequestView } from '@dpp/shared';
import { OrganizationDirectory } from '../../organizations/index.js';
import { ProductDirectory } from '../../products/index.js';
import { isExpired, type TransferRequestRecord } from '../domain/transfer-request.js';
import { TransferParties } from './transfer-parties.js';

/** Dựng TransferRequestView: sản phẩm, hai bên (đánh dấu người xem), trạng thái quá hạn. */
@Injectable()
export class TransferViews {
  constructor(
    private readonly products: ProductDirectory,
    private readonly organizations: OrganizationDirectory,
    private readonly parties: TransferParties,
  ) {}

  async present(
    requests: readonly TransferRequestRecord[],
    viewer: readonly string[],
    now: Date,
  ): Promise<TransferRequestView[]> {
    const [refs, labels] = await Promise.all([
      this.products.describe(requests.map((request) => request.productId)),
      this.parties.describe(
        requests.flatMap((request) => [request.fromPartyId, request.toPartyId]),
        viewer,
      ),
    ]);
    const issuers = await this.organizations.describe(
      [...refs.values()].map((ref) => ref.issuerOrgId),
    );
    const products = new Map<string, TransferProduct>(
      [...refs.values()].map((ref) => [
        ref.id,
        {
          id: ref.id,
          publicCode: ref.publicCode,
          serialNumber: ref.serialNumber,
          modelName: ref.modelName,
          chainProductId: ref.chainProductId,
          issuer: {
            organizationId: ref.issuerOrgId,
            name: issuers.get(ref.issuerOrgId)?.name ?? '',
            partyId: partyIdFromUuid(ref.issuerOrgId),
          },
        },
      ]),
    );
    const fallback = { kind: 'PERSON', fullName: '', maskedEmail: '', isYou: false } as const;
    return requests.flatMap((request): TransferRequestView[] => {
      const product = products.get(request.productId);
      if (!product) {
        return [];
      }
      return [
        {
          id: request.id,
          requestId: request.chainRequestId.toString(),
          state: request.transferState,
          expired: isExpired(request, now),
          direction: viewer.includes(request.toPartyId) ? 'INCOMING' : 'OUTGOING',
          from: labels.get(request.fromPartyId) ?? fallback,
          to: labels.get(request.toPartyId) ?? fallback,
          product,
          requestedAt: request.requestedAt.toISOString(),
          expiresAt: request.expiresAt.toISOString(),
          closedAt: request.closedAt?.toISOString() ?? null,
          createdTxHash: request.createdTxHash,
          closedTxHash: request.closedTxHash,
        },
      ];
    });
  }
}
