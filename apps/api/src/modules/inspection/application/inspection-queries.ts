import { Inject, Injectable } from '@nestjs/common';
import {
  type ContractInfo,
  INSPECTION_REGISTRY_CONTRACT_NAME,
  type InspectionDetail,
  type InspectionFilter,
  type InspectionItem,
  type InspectionProduct,
  type InspectionRequesterInfo,
  type MyInspections,
  partyIdFromUuid,
  type PublicProductInspections,
  toChecksumAddress,
} from '@dpp/shared';
import { ChainEventHistory, presentChainEvent } from '../../chain-sync/index.js';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { OrganizationDirectory, type OrganizationRef } from '../../organizations/index.js';
import { maskEmail, ProductDirectory } from '../../products/index.js';
import {
  type InspectionRequestRecord,
  inspectionIdOf,
  requesterRoleOf,
} from '../domain/inspection-request.js';
import {
  InspectionProductNotFoundError,
  InspectionRequestNotFoundError,
} from '../domain/inspection.errors.js';
import { InspectionViews } from './inspection-views.js';
import { InspectorAccess } from './inspector-access.service.js';
import { INSPECTION_CHAIN, type InspectionChain } from './ports/inspection-chain.port.js';
import {
  INSPECTION_REQUEST_REPOSITORY,
  type InspectionRequestRepository,
} from './ports/inspection-request.repository.js';

const EMPTY_COUNTS: Record<InspectionFilter, number> = { REQUESTED: 0, COMPLETED: 0, CLOSED: 0 };

export interface InspectionListQueryInput {
  filter: InspectionFilter;
  page: number;
  pageSize: number;
}

export function inspectionContractInfo(chain: InspectionChain): ContractInfo | null {
  return chain.contractAddress
    ? { chainId: chain.chainId, address: toChecksumAddress(chain.contractAddress) }
    : null;
}

function inspectorInfo(inspector: OrganizationRef) {
  return {
    organizationId: inspector.id,
    name: inspector.name,
    partyId: inspector.partyId,
    authStatus: inspector.authStatus,
    orgType: inspector.orgType,
  };
}

/** Sản phẩm của các yêu cầu kèm tên nhà sản xuất, tra một lần. */
async function productsOf(
  products: ProductDirectory,
  organizations: OrganizationDirectory,
  requests: readonly InspectionRequestRecord[],
): Promise<Map<string, InspectionProduct>> {
  const refs = await products.describe(requests.map((request) => request.productId));
  const issuers = await organizations.describe([...refs.values()].map((ref) => ref.issuerOrgId));
  return new Map(
    [...refs.values()].map((ref) => {
      const issuer = issuers.get(ref.issuerOrgId);
      return [
        ref.id,
        {
          id: ref.id,
          publicCode: ref.publicCode,
          serialNumber: ref.serialNumber,
          modelName: ref.modelName,
          chainProductId: ref.chainProductId,
          productState: ref.productState,
          issuer: {
            organizationId: ref.issuerOrgId,
            name: issuer?.name ?? '',
            partyId: issuer?.partyId ?? partyIdFromUuid(ref.issuerOrgId),
          },
        },
      ];
    }),
  );
}

/** Danh sách yêu cầu của đơn vị kiểm định: chờ kiểm định, đã có kết quả, đã đóng. */
@Injectable()
export class ListInspections {
  constructor(
    @Inject(INSPECTION_REQUEST_REPOSITORY) private readonly requests: InspectionRequestRepository,
    @Inject(INSPECTION_CHAIN) private readonly chain: InspectionChain,
    private readonly access: InspectorAccess,
    private readonly products: ProductDirectory,
    private readonly organizations: OrganizationDirectory,
    private readonly views: InspectionViews,
  ) {}

  async execute(user: AuthenticatedUser, query: InspectionListQueryInput): Promise<MyInspections> {
    const inspector = await this.access.find(user);
    const base = {
      contract: inspectionContractInfo(this.chain),
      page: query.page,
      pageSize: query.pageSize,
    };
    if (!inspector) {
      return { ...base, inspector: null, items: [], total: 0, counts: EMPTY_COUNTS };
    }
    const [{ items, total }, counts] = await Promise.all([
      this.requests.listForInspector({ inspectorOrgId: inspector.id, ...query }),
      this.requests.countsForInspector(inspector.id),
    ]);
    const [views, products] = await Promise.all([
      this.views.present(items, { includePending: true, verify: false }),
      productsOf(this.products, this.organizations, items),
    ]);
    return {
      ...base,
      inspector: inspectorInfo(inspector),
      items: views.flatMap((view, index): InspectionItem[] => {
        const product = products.get(items[index]?.productId ?? '');
        return product ? [{ ...view, product }] : [];
      }),
      total,
      counts,
    };
  }
}

/** Chi tiết một yêu cầu của đơn vị kiểm định: người gửi, sản phẩm, lịch sử on-chain. */
@Injectable()
export class GetInspection {
  constructor(
    @Inject(INSPECTION_REQUEST_REPOSITORY) private readonly requests: InspectionRequestRepository,
    @Inject(INSPECTION_CHAIN) private readonly chain: InspectionChain,
    private readonly access: InspectorAccess,
    private readonly products: ProductDirectory,
    private readonly organizations: OrganizationDirectory,
    private readonly identity: IdentityDirectory,
    private readonly history: ChainEventHistory,
    private readonly views: InspectionViews,
  ) {}

  async execute(user: AuthenticatedUser, requestId: string): Promise<InspectionDetail> {
    const inspector = await this.access.requireOrganization(user);
    const request = await this.requests.findById(requestId);
    if (!request || request.inspectorOrgId !== inspector.id) {
      throw new InspectionRequestNotFoundError();
    }
    const [[view], products, events] = await Promise.all([
      this.views.present([request], { includePending: true, verify: true }),
      productsOf(this.products, this.organizations, [request]),
      this.history.ofCorrelation(INSPECTION_REGISTRY_CONTRACT_NAME, inspectionIdOf(request.id)),
    ]);
    const product = products.get(request.productId);
    if (!view || !product) {
      throw new InspectionRequestNotFoundError();
    }
    return {
      ...view,
      product,
      requester: await this.requester(request, product.issuer.organizationId, product.issuer.name),
      contract: inspectionContractInfo(this.chain),
      history: events.map(presentChainEvent),
    };
  }

  /** Nhà sản xuất hiện tên; chủ sở hữu hiện họ tên và email đã che bớt. */
  private async requester(
    request: InspectionRequestRecord,
    issuerOrgId: string,
    issuerName: string,
  ): Promise<InspectionRequesterInfo> {
    if (requesterRoleOf(request, issuerOrgId) === 'MANUFACTURER') {
      return { kind: 'MANUFACTURER', name: issuerName };
    }
    const userId =
      (await this.identity.describeParties([request.requestedByPartyId])).get(
        request.requestedByPartyId,
      )?.userId ?? null;
    const owner = userId ? (await this.identity.describeUsers([userId])).get(userId) : undefined;
    return {
      kind: 'OWNER',
      fullName: owner?.fullName ?? '',
      maskedEmail: owner ? maskEmail(owner.email) : '',
    };
  }
}

/** Kết quả kiểm định trên hộ chiếu công khai (D59): ai cũng xem được, kèm đối chiếu hash. */
@Injectable()
export class GetPublicInspections {
  constructor(
    @Inject(INSPECTION_REQUEST_REPOSITORY) private readonly requests: InspectionRequestRepository,
    private readonly products: ProductDirectory,
    private readonly views: InspectionViews,
  ) {}

  async execute(publicCode: string): Promise<PublicProductInspections> {
    const product = await this.products.findByPublicCode(publicCode);
    if (!product) {
      throw new InspectionProductNotFoundError();
    }
    const requests = await this.requests.listForProduct(product.id);
    return { items: await this.views.presentPublic(requests, product.issuerOrgId) };
  }
}
