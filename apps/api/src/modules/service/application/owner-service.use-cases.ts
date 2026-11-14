import { Inject, Injectable } from '@nestjs/common';
import {
  normalizeText,
  type OwnedProductService,
  type ServiceCenterOption,
  type ServiceRequestInput,
  type ServiceRequestView,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import { OrganizationDirectory } from '../../organizations/index.js';
import { OwnerParties, ProductDirectory, type ProductRef } from '../../products/index.js';
import { isOpenRequest } from '../domain/service-request.js';
import {
  ServiceCenterNotFoundError,
  ServiceChainNotConfiguredError,
  ServiceProductNotFoundError,
  ServiceProductNotOwnedError,
  ServiceRequestNotFoundError,
  ServiceRequestOpenError,
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
import { ServiceViews } from './service-views.js';

interface OwnerContext {
  /** UUID Party đang sở hữu: cá nhân, hoặc (M9) tổ chức người dùng đại diện. */
  ownerPartyId: string;
  product: ProductRef;
}

/** Chủ sở hữu hiện tại của sản phẩm; người khác nhận "không tìm thấy" để không lộ sản phẩm. */
@Injectable()
export class ProductOwnerAccess {
  constructor(
    private readonly owners: OwnerParties,
    private readonly products: ProductDirectory,
  ) {}

  async require(user: AuthenticatedUser, productId: string): Promise<OwnerContext> {
    const { partyIds } = await this.owners.of(user.id);
    const product = partyIds.length > 0 ? await this.products.findById(productId) : null;
    const ownerPartyId = product?.currentOwnerPartyId;
    if (!product || !ownerPartyId || !partyIds.includes(ownerPartyId)) {
      throw new ServiceProductNotFoundError();
    }
    return { ownerPartyId, product };
  }

  /** Các Party người dùng đứng tên (để huỷ yêu cầu đã gửi). */
  async partiesOf(user: AuthenticatedUser): Promise<string[]> {
    return (await this.owners.of(user.id)).partyIds;
  }
}

async function serviceCenters(
  organizations: OrganizationDirectory,
): Promise<ServiceCenterOption[]> {
  const centers = await organizations.authorizedOfType('SERVICE_CENTER');
  return centers.map((center) => ({
    organizationId: center.id,
    name: center.name,
    address: center.address,
    partyId: center.partyId,
  }));
}

/** Phần bảo hành, sửa chữa trên trang sản phẩm đã mua: trung tâm để chọn và các yêu cầu đã gửi. */
@Injectable()
export class GetOwnedProductService {
  constructor(
    @Inject(SERVICE_REQUEST_REPOSITORY) private readonly requests: ServiceRequestRepository,
    @Inject(SERVICE_TICKET_CHAIN) private readonly chain: ServiceTicketChain,
    private readonly owners: ProductOwnerAccess,
    private readonly organizations: OrganizationDirectory,
    private readonly views: ServiceViews,
  ) {}

  async execute(user: AuthenticatedUser, productId: string): Promise<OwnedProductService> {
    const { ownerPartyId, product } = await this.owners.require(user, productId);
    const [all, centers] = await Promise.all([
      this.requests.listForProduct(product.id),
      serviceCenters(this.organizations),
    ]);
    // Yêu cầu của chủ trước (nếu sản phẩm đã đổi chủ) không hiện mô tả lỗi cho chủ mới.
    const mine = all.filter((request) => request.requestedByPartyId === ownerPartyId);
    const requests = await this.views.present(mine, { includePending: false, verify: true });
    return {
      blockedReason: blockedReason({
        configured: this.chain.contractAddress !== null,
        product,
        hasOpen: all.some(isOpenRequest),
        centers: centers.length,
      }),
      centers,
      requests,
    };
  }
}

function blockedReason(input: {
  configured: boolean;
  product: ProductRef;
  hasOpen: boolean;
  centers: number;
}): string | null {
  if (!input.configured) {
    return 'Hệ thống chưa cấu hình ServiceTicketManager nên chưa gửi yêu cầu bảo hành được.';
  }
  if (input.product.productState !== 'SOLD') {
    return 'Sản phẩm đã thu hồi, báo mất hoặc ngừng sử dụng nên không gửi bảo hành được.';
  }
  if (input.hasOpen) {
    return 'Sản phẩm đang có một yêu cầu chưa xong. Huỷ yêu cầu đó (khi trung tâm chưa tiếp nhận) hoặc chờ trung tâm đóng phiếu.';
  }
  if (input.centers === 0) {
    return 'Chưa có trung tâm bảo hành nào được duyệt trong hệ thống.';
  }
  return null;
}

/**
 * SVC-01: chủ sở hữu (không cần ví) chọn trung tâm bảo hành và mô tả lỗi. Yêu cầu chỉ nằm off-chain
 * tới khi trung tâm tiếp nhận và mở phiếu bằng giấy phép của registrar.
 */
@Injectable()
export class SubmitServiceRequest {
  constructor(
    @Inject(SERVICE_REQUEST_REPOSITORY) private readonly requests: ServiceRequestRepository,
    @Inject(SERVICE_TICKET_CHAIN) private readonly chain: ServiceTicketChain,
    private readonly owners: ProductOwnerAccess,
    private readonly organizations: OrganizationDirectory,
    private readonly views: ServiceViews,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    productId: string,
    input: ServiceRequestInput,
    client: ClientContext,
  ): Promise<ServiceRequestView> {
    if (!this.chain.contractAddress) {
      throw new ServiceChainNotConfiguredError();
    }
    const { ownerPartyId, product } = await this.owners.require(user, productId);
    if (product.productState !== 'SOLD') {
      throw new ServiceProductNotOwnedError();
    }
    const center = (await this.organizations.describe([input.serviceCenterOrgId])).get(
      input.serviceCenterOrgId,
    );
    if (center?.orgType !== 'SERVICE_CENTER' || center.authStatus !== 'AUTHORIZED') {
      throw new ServiceCenterNotFoundError();
    }
    const request = await this.requests.create({
      productId: product.id,
      requestedByPartyId: ownerPartyId,
      serviceCenterOrgId: center.id,
      issueDesc: normalizeText(input.issueDesc) ?? '',
    });
    await this.audit.record({
      action: AuditAction.SERVICE_REQUESTED,
      actorUserId: user.id,
      targetType: 'service_request',
      targetId: request.id,
      metadata: { productId: product.id, serviceCenterOrgId: center.id },
      client,
    });
    const [view] = await this.views.present([request], { includePending: false, verify: false });
    if (!view) {
      throw new ServiceRequestOpenError();
    }
    return view;
  }
}

/** SVC-02: chủ sở hữu huỷ yêu cầu khi trung tâm chưa tiếp nhận (REQUESTED thành CANCELLED, off-chain). */
@Injectable()
export class CancelServiceRequest {
  constructor(
    @Inject(SERVICE_REQUEST_REPOSITORY) private readonly requests: ServiceRequestRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly owners: ProductOwnerAccess,
    private readonly audit: AuditTrail,
  ) {}

  async execute(user: AuthenticatedUser, requestId: string, client: ClientContext): Promise<void> {
    const [parties, request] = await Promise.all([
      this.owners.partiesOf(user),
      this.requests.findById(requestId),
    ]);
    if (!request || !parties.includes(request.requestedByPartyId)) {
      throw new ServiceRequestNotFoundError();
    }
    if (
      request.serviceState !== 'REQUESTED' ||
      !(await this.requests.cancel(request.id, this.clock.now()))
    ) {
      throw new ServiceRequestStateError(
        'Trung tâm đã tiếp nhận (hoặc yêu cầu đã đóng) nên không huỷ được. Tải lại trang.',
      );
    }
    await this.audit.record({
      action: AuditAction.SERVICE_REQUEST_CANCELLED,
      actorUserId: user.id,
      targetType: 'service_request',
      targetId: request.id,
      metadata: { productId: request.productId },
      client,
    });
  }
}
