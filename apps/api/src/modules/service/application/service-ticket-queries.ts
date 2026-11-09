import { Inject, Injectable } from '@nestjs/common';
import {
  type ContractInfo,
  type MyServiceTickets,
  partyIdFromUuid,
  SERVICE_TICKET_MANAGER_CONTRACT_NAME,
  type ServiceTicketDetail,
  type ServiceTicketFilter,
  type ServiceTicketItem,
  type ServiceTicketProduct,
  toChecksumAddress,
} from '@dpp/shared';
import { ChainEventHistory, presentChainEvent } from '../../chain-sync/index.js';
import { type AuthenticatedUser, IdentityDirectory } from '../../identity/index.js';
import { OrganizationDirectory, type OrganizationRef } from '../../organizations/index.js';
import { maskEmail, ProductDirectory, type ProductRef } from '../../products/index.js';
import { type ServiceRequestRecord, ticketIdOf } from '../domain/service-request.js';
import { ServiceRequestNotFoundError } from '../domain/service.errors.js';
import {
  SERVICE_REQUEST_REPOSITORY,
  type ServiceRequestRepository,
} from './ports/service-request.repository.js';
import {
  SERVICE_TICKET_CHAIN,
  type ServiceTicketChain,
} from './ports/service-ticket-chain.port.js';
import { ServiceCenterAccess } from './service-center-access.service.js';
import { ServiceViews } from './service-views.js';

const EMPTY_COUNTS: Record<ServiceTicketFilter, number> = { REQUESTED: 0, IN_REPAIR: 0, CLOSED: 0 };

export interface ServiceTicketListQuery {
  filter: ServiceTicketFilter;
  page: number;
  pageSize: number;
}

export function serviceContractInfo(chain: ServiceTicketChain): ContractInfo | null {
  return chain.contractAddress
    ? { chainId: chain.chainId, address: toChecksumAddress(chain.contractAddress) }
    : null;
}

function centerInfo(center: OrganizationRef) {
  return {
    organizationId: center.id,
    name: center.name,
    partyId: center.partyId,
    authStatus: center.authStatus,
    orgType: center.orgType,
  };
}

/** Sản phẩm của các phiếu kèm tên nhà sản xuất, tra một lần. */
async function productsOf(
  products: ProductDirectory,
  organizations: OrganizationDirectory,
  requests: readonly ServiceRequestRecord[],
): Promise<Map<string, ServiceTicketProduct>> {
  const refs = await products.describe(requests.map((request) => request.productId));
  const issuers = await organizations.describe([...refs.values()].map((ref) => ref.issuerOrgId));
  return new Map(
    [...refs.values()].map((ref: ProductRef) => {
      const issuer = issuers.get(ref.issuerOrgId);
      return [
        ref.id,
        {
          id: ref.id,
          publicCode: ref.publicCode,
          serialNumber: ref.serialNumber,
          modelName: ref.modelName,
          chainProductId: ref.chainProductId,
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

/** Danh sách phiếu của trung tâm: chờ tiếp nhận, đang sửa, đã đóng. */
@Injectable()
export class ListServiceTickets {
  constructor(
    @Inject(SERVICE_REQUEST_REPOSITORY) private readonly requests: ServiceRequestRepository,
    @Inject(SERVICE_TICKET_CHAIN) private readonly chain: ServiceTicketChain,
    private readonly access: ServiceCenterAccess,
    private readonly products: ProductDirectory,
    private readonly organizations: OrganizationDirectory,
    private readonly views: ServiceViews,
  ) {}

  async execute(user: AuthenticatedUser, query: ServiceTicketListQuery): Promise<MyServiceTickets> {
    const center = await this.access.find(user);
    const base = {
      contract: serviceContractInfo(this.chain),
      page: query.page,
      pageSize: query.pageSize,
    };
    if (!center) {
      return { ...base, serviceCenter: null, items: [], total: 0, counts: EMPTY_COUNTS };
    }
    const [{ items, total }, counts] = await Promise.all([
      this.requests.listForCenter({ serviceCenterOrgId: center.id, ...query }),
      this.requests.countsForCenter(center.id),
    ]);
    const [views, products] = await Promise.all([
      this.views.present(items, { includePending: true, verify: false }),
      productsOf(this.products, this.organizations, items),
    ]);
    return {
      ...base,
      serviceCenter: centerInfo(center),
      items: views.flatMap((view, index): ServiceTicketItem[] => {
        const product = products.get(items[index]?.productId ?? '');
        return product ? [{ ...view, product }] : [];
      }),
      total,
      counts,
    };
  }
}

/** Chi tiết một phiếu của trung tâm: chủ sở hữu (email che bớt), bảo hành, lịch sử on-chain. */
@Injectable()
export class GetServiceTicket {
  constructor(
    @Inject(SERVICE_REQUEST_REPOSITORY) private readonly requests: ServiceRequestRepository,
    @Inject(SERVICE_TICKET_CHAIN) private readonly chain: ServiceTicketChain,
    private readonly access: ServiceCenterAccess,
    private readonly products: ProductDirectory,
    private readonly organizations: OrganizationDirectory,
    private readonly identity: IdentityDirectory,
    private readonly history: ChainEventHistory,
    private readonly views: ServiceViews,
  ) {}

  async execute(user: AuthenticatedUser, requestId: string): Promise<ServiceTicketDetail> {
    const center = await this.access.requireOrganization(user);
    const request = await this.requests.findById(requestId);
    if (!request || request.serviceCenterOrgId !== center.id) {
      throw new ServiceRequestNotFoundError();
    }
    const [[view], products, warranties, parties, events] = await Promise.all([
      this.views.present([request], { includePending: true, verify: true }),
      productsOf(this.products, this.organizations, [request]),
      this.products.warrantiesOf([request.productId]),
      this.identity.describeParties([request.requestedByPartyId]),
      this.history.ofCorrelation(SERVICE_TICKET_MANAGER_CONTRACT_NAME, ticketIdOf(request.id)),
    ]);
    const product = products.get(request.productId);
    if (!view || !product) {
      throw new ServiceRequestNotFoundError();
    }
    const requesterUserId = parties.get(request.requestedByPartyId)?.userId ?? null;
    const requester = requesterUserId
      ? (await this.identity.describeUsers([requesterUserId])).get(requesterUserId)
      : undefined;
    const warranty = warranties.get(request.productId);
    return {
      ...view,
      product,
      requester: requester
        ? { fullName: requester.fullName, maskedEmail: maskEmail(requester.email) }
        : { fullName: '', maskedEmail: '' },
      warranty: warranty
        ? { state: warranty.state, expiresAt: warranty.expiresAt.toISOString() }
        : null,
      contract: serviceContractInfo(this.chain),
      history: events.map(presentChainEvent),
    };
  }
}
