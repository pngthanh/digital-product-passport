import { Inject, Injectable } from '@nestjs/common';
import {
  type InspectionRequesterRole,
  type InspectionRequestInput,
  type InspectionRequestView,
  type InspectorOption,
  normalizeText,
  type ProductInspection,
} from '@dpp/shared';
import type { ClientContext } from '../../../common/domain/client-context.js';
import { CLOCK, type Clock } from '../../../common/time/clock.js';
import { AuditAction, AuditTrail } from '../../audit/index.js';
import type { AuthenticatedUser } from '../../identity/index.js';
import { OrganizationDirectory } from '../../organizations/index.js';
import { INSPECTABLE_STATES } from '../domain/inspection-request.js';
import {
  InspectionChainNotConfiguredError,
  InspectionProductInactiveError,
  InspectionRequestNotFoundError,
  InspectionRequestPendingError,
  InspectionRequesterNotAuthorizedError,
  InspectionRequestStateError,
  InspectorNotFoundError,
} from '../domain/inspection.errors.js';
import { InspectionViews } from './inspection-views.js';
import { INSPECTION_CHAIN, type InspectionChain } from './ports/inspection-chain.port.js';
import {
  INSPECTION_REQUEST_REPOSITORY,
  type InspectionRequestRepository,
} from './ports/inspection-request.repository.js';
import { InspectionRequesterAccess, type RequesterContext } from './requester-access.service.js';

function contextOf(
  access: InspectionRequesterAccess,
  user: AuthenticatedUser,
  productId: string,
  role: InspectionRequesterRole,
): Promise<RequesterContext> {
  return role === 'MANUFACTURER'
    ? access.manufacturer(user, productId)
    : access.owner(user, productId);
}

async function inspectors(organizations: OrganizationDirectory): Promise<InspectorOption[]> {
  const list = await organizations.authorizedOfType('INSPECTOR');
  return list.map((inspector) => ({
    organizationId: inspector.id,
    name: inspector.name,
    address: inspector.address,
    partyId: inspector.partyId,
  }));
}

function blockedReason(input: {
  configured: boolean;
  context: RequesterContext;
  hasPending: boolean;
  inspectors: number;
}): string | null {
  if (!input.configured) {
    return 'Hệ thống chưa cấu hình InspectionRegistry nên chưa gửi yêu cầu kiểm định được.';
  }
  const organization = input.context.organization;
  if (organization && organization.authStatus !== 'AUTHORIZED') {
    return 'Doanh nghiệp chưa được duyệt hoặc đã bị khoá nên không gửi yêu cầu kiểm định được.';
  }
  if (!INSPECTABLE_STATES.includes(input.context.product.productState)) {
    return 'Sản phẩm đã thu hồi, báo mất hoặc ngừng sử dụng nên không kiểm định được.';
  }
  if (input.hasPending) {
    return 'Sản phẩm đang có một yêu cầu kiểm định chờ kết quả. Chờ đơn vị kiểm định xử lý, hoặc người gửi huỷ yêu cầu đó.';
  }
  if (input.inspectors === 0) {
    return 'Chưa có đơn vị kiểm định nào được duyệt trong hệ thống.';
  }
  return null;
}

/**
 * Phần kiểm định trên trang sản phẩm của nhà sản xuất hoặc của chủ sở hữu: đơn vị để chọn và các
 * yêu cầu chính bên đó đã gửi.
 */
@Injectable()
export class GetProductInspection {
  constructor(
    @Inject(INSPECTION_REQUEST_REPOSITORY) private readonly requests: InspectionRequestRepository,
    @Inject(INSPECTION_CHAIN) private readonly chain: InspectionChain,
    private readonly access: InspectionRequesterAccess,
    private readonly organizations: OrganizationDirectory,
    private readonly views: InspectionViews,
  ) {}

  async execute(
    user: AuthenticatedUser,
    productId: string,
    role: InspectionRequesterRole,
  ): Promise<ProductInspection> {
    const context = await contextOf(this.access, user, productId, role);
    const [all, options] = await Promise.all([
      this.requests.listForProduct(context.product.id),
      inspectors(this.organizations),
    ]);
    // Nhà sản xuất và chủ sở hữu chỉ thấy yêu cầu của mình; kết quả của mọi lần kiểm định nằm trên
    // hộ chiếu công khai.
    const mine = all.filter((request) => request.requestedByPartyId === context.partyId);
    return {
      blockedReason: blockedReason({
        configured: this.chain.contractAddress !== null,
        context,
        hasPending: all.some((request) => request.requestState === 'REQUESTED'),
        inspectors: options.length,
      }),
      inspectors: options,
      requests: await this.views.present(mine, { includePending: false, verify: true }),
    };
  }
}

/**
 * INS-02: nhà sản xuất hoặc chủ sở hữu (không cần ví) chọn đơn vị kiểm định và ghi nội dung cần
 * kiểm định. Yêu cầu chỉ nằm off-chain tới khi đơn vị kiểm định ghi kết quả.
 */
@Injectable()
export class SubmitInspectionRequest {
  constructor(
    @Inject(INSPECTION_REQUEST_REPOSITORY) private readonly requests: InspectionRequestRepository,
    @Inject(INSPECTION_CHAIN) private readonly chain: InspectionChain,
    private readonly access: InspectionRequesterAccess,
    private readonly organizations: OrganizationDirectory,
    private readonly views: InspectionViews,
    private readonly audit: AuditTrail,
  ) {}

  async execute(
    user: AuthenticatedUser,
    productId: string,
    role: InspectionRequesterRole,
    input: InspectionRequestInput,
    client: ClientContext,
  ): Promise<InspectionRequestView> {
    if (!this.chain.contractAddress) {
      throw new InspectionChainNotConfiguredError();
    }
    const context = await contextOf(this.access, user, productId, role);
    if (context.organization && context.organization.authStatus !== 'AUTHORIZED') {
      throw new InspectionRequesterNotAuthorizedError();
    }
    if (!INSPECTABLE_STATES.includes(context.product.productState)) {
      throw new InspectionProductInactiveError();
    }
    const inspector = (await this.organizations.describe([input.inspectorOrgId])).get(
      input.inspectorOrgId,
    );
    if (inspector?.orgType !== 'INSPECTOR' || inspector.authStatus !== 'AUTHORIZED') {
      throw new InspectorNotFoundError();
    }
    const request = await this.requests.create({
      productId: context.product.id,
      requestedByPartyId: context.partyId,
      inspectorOrgId: inspector.id,
      note: normalizeText(input.note) ?? '',
    });
    await this.audit.record({
      action: AuditAction.INSPECTION_REQUESTED,
      actorUserId: user.id,
      targetType: 'inspection_request',
      targetId: request.id,
      metadata: { productId: context.product.id, inspectorOrgId: inspector.id, role },
      client,
    });
    const [view] = await this.views.present([request], { includePending: false, verify: false });
    if (!view) {
      throw new InspectionRequestPendingError();
    }
    return view;
  }
}

/** INS-03: người gửi huỷ yêu cầu khi đơn vị kiểm định chưa ghi kết quả (off-chain). */
@Injectable()
export class CancelInspectionRequest {
  constructor(
    @Inject(INSPECTION_REQUEST_REPOSITORY) private readonly requests: InspectionRequestRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly access: InspectionRequesterAccess,
    private readonly audit: AuditTrail,
  ) {}

  async execute(user: AuthenticatedUser, requestId: string, client: ClientContext): Promise<void> {
    const [request, parties] = await Promise.all([
      this.requests.findById(requestId),
      this.access.partiesOf(user),
    ]);
    if (!request || !parties.includes(request.requestedByPartyId)) {
      throw new InspectionRequestNotFoundError();
    }
    if (
      request.requestState !== 'REQUESTED' ||
      !(await this.requests.cancel(request.id, this.clock.now()))
    ) {
      throw new InspectionRequestStateError(
        'Yêu cầu đã có kết quả, đã bị từ chối hoặc đã huỷ nên không huỷ được. Tải lại trang.',
      );
    }
    await this.audit.record({
      action: AuditAction.INSPECTION_REQUEST_CANCELLED,
      actorUserId: user.id,
      targetType: 'inspection_request',
      targetId: request.id,
      metadata: { productId: request.productId },
      client,
    });
  }
}
