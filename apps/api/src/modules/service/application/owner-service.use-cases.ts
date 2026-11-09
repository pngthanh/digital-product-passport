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
import {
  type AuthenticatedUser,
  IdentityDirectory,
  type PartyActor,
} from '../../identity/index.js';
import { OrganizationDirectory } from '../../organizations/index.js';
import { ProductDirectory, type ProductRef } from '../../products/index.js';
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
  actor: PartyActor;
  product: ProductRef;
}

/** Chủ sở hữu hiện tại của sản phẩm; người khác nhận "không tìm thấy" để không lộ sản phẩm. */
@Injectable()
export class ProductOwnerAccess {
  constructor(
    private readonly identity: IdentityDirectory,
    private readonly products: ProductDirectory,
  ) {}

  async require(user: AuthenticatedUser, productId: string): Promise<OwnerContext> {
    const actor = await this.identity.actorOf(user.id);
    const product = actor ? await this.products.findById(productId) : null;
    if (!actor || !product || product.currentOwnerPartyId !== actor.partyId) {
      throw new ServiceProductNotFoundError();
    }
    return { actor, product };
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
    const { actor, product } = await this.owners.require(user, productId);
    const [all, centers] = await Promise.all([
      this.requests.listForProduct(product.id),
      serviceCenters(this.organizations),
    ]);
    // Yêu cầu của chủ trước (nếu sản phẩm đã đổi chủ) không hiện mô tả lỗi cho chủ mới.
    const mine = all.filter((request) => request.requestedByPartyId === actor.partyId);
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
    return 'Chỉ gửi yêu cầu bảo hành cho sản phẩm đang có chủ.';
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
    const { actor, product } = await this.owners.require(user, productId);
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
      requestedByPartyId: actor.partyId,
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
    private readonly identity: IdentityDirectory,
    private readonly audit: AuditTrail,
  ) {}

  async execute(user: AuthenticatedUser, requestId: string, client: ClientContext): Promise<void> {
    const actor = await this.identity.actorOf(user.id);
    const request = actor ? await this.requests.findById(requestId) : null;
    if (!actor || !request || request.requestedByPartyId !== actor.partyId) {
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
