import {
  SERVICE_TICKET_MANAGER_ABI,
  type ServiceActionCode,
  type ServiceRequestView,
  type ServiceState,
  type ServiceTicketClosing,
  type ServiceTicketOpeningAuthorization,
} from '@dpp/shared';
import { apiCommand, apiRequest } from '@/lib/api-client';
import { evidenceFileError } from '@/lib/evidence-file';
import { sendContractTransaction, waitUntil } from '@/lib/wallet/send-registry-transaction';
import { WalletFlowError } from '@/lib/wallet/wallet-errors';
import { trackedTransactionSchema } from '../organization/organization.schema';
import {
  openingAuthorizationSchema,
  serviceRequestViewSchema,
  serviceTicketDetailSchema,
  ticketClosingSchema,
} from './service.schema';

export const TICKET_STEPS = ['prepare', 'send', 'confirm'] as const;
export type TicketStep = (typeof TICKET_STEPS)[number];

const TIMEOUT_MESSAGE =
  'Giao dịch đã được gửi nhưng hệ thống chưa thấy xác nhận. Tải lại trang sau ít phút.';

/** SVC-01: chủ sở hữu gửi yêu cầu bảo hành tới trung tâm đã chọn (không cần ví). */
export function requestService(
  productId: string,
  serviceCenterOrgId: string,
  issueDesc: string,
): Promise<ServiceRequestView> {
  return apiRequest(`/me/owned-products/${productId}/service-requests`, serviceRequestViewSchema, {
    method: 'POST',
    body: { serviceCenterOrgId, issueDesc },
  });
}

/** SVC-02: chủ sở hữu huỷ yêu cầu khi trung tâm chưa tiếp nhận. */
export function cancelServiceRequest(requestId: string): Promise<void> {
  return apiCommand(`/me/service-requests/${requestId}/cancel`);
}

function stateIs(requestId: string, states: readonly ServiceState[]) {
  return async () =>
    states.includes(
      (await apiRequest(`/me/service-tickets/${requestId}`, serviceTicketDetailSchema)).state,
    );
}

/** Ví trung tâm gửi một hàm của ServiceTicketManager, web báo txHash rồi chờ Worker chốt. */
async function sendAndSettle(
  call: { chainId: number; contractAddress: string; wallet: string },
  method: 'openTicket' | 'closeTicket',
  args: readonly unknown[],
  settled: () => Promise<boolean>,
  onStep: (step: TicketStep) => void,
): Promise<string> {
  onStep('send');
  const txHash = await sendContractTransaction(SERVICE_TICKET_MANAGER_ABI, {
    ...call,
    method,
    args,
  });
  onStep('confirm');
  await apiRequest('/me/service-tickets/transactions', trackedTransactionSchema, {
    method: 'POST',
    body: { txHash },
  });
  await waitUntil(settled, TIMEOUT_MESSAGE);
  return txHash;
}

/**
 * SVC-03: trung tâm nhận giấy phép mở phiếu (registrar ký) rồi ví trung tâm gửi openTicket; còn
 * bảo hành thì bảo hành tạm dừng ngay trong giao dịch này.
 */
export async function openServiceTicket(
  requestId: string,
  onStep: (step: TicketStep) => void,
): Promise<string> {
  onStep('prepare');
  const auth: ServiceTicketOpeningAuthorization = await apiRequest(
    `/me/service-tickets/${requestId}/opening-authorizations`,
    openingAuthorizationSchema,
    { method: 'POST' },
  );
  return sendAndSettle(
    auth,
    'openTicket',
    [auth.ticketId, auth.productId, auth.requesterId, BigInt(auth.deadline), auth.signature],
    stateIs(requestId, ['IN_REPAIR']),
    onStep,
  );
}

export interface ServiceResultInput {
  repaired: boolean;
  actionCode: ServiceActionCode;
  actionDetail: string;
  file: File | null;
}

/**
 * SVC-04: tải biên bản (nội dung và file) lên API, API trả hash biên bản; ví trung tâm gửi
 * closeTicket với đúng hash đó. Còn bảo hành thì bảo hành tiếp tục trong giao dịch này.
 */
export async function closeServiceTicket(
  requestId: string,
  input: ServiceResultInput,
  onStep: (step: TicketStep) => void,
): Promise<string> {
  const fileError = evidenceFileError(input.file);
  if (fileError) {
    throw new WalletFlowError(fileError);
  }
  onStep('prepare');
  const form = new FormData();
  form.set('repaired', String(input.repaired));
  form.set('actionCode', input.actionCode);
  form.set('actionDetail', input.actionDetail);
  if (input.file) {
    form.set('evidence', input.file);
  }
  const closing: ServiceTicketClosing = await apiRequest(
    `/me/service-tickets/${requestId}/results`,
    ticketClosingSchema,
    { method: 'POST', body: form },
  );
  return sendAndSettle(
    closing,
    'closeTicket',
    [closing.ticketId, closing.repaired, closing.evidenceHash],
    stateIs(requestId, ['REPAIRED', 'REJECTED']),
    onStep,
  );
}
