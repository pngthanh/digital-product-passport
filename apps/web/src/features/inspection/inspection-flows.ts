import {
  INSPECTION_REGISTRY_ABI,
  type InspectionRequestState,
  type InspectionRequestView,
  type InspectionResult,
} from '@dpp/shared';
import { apiCommand, apiRequest } from '@/lib/api-client';
import { evidenceFileError } from '@/lib/evidence-file';
import { sendContractTransaction, waitUntil } from '@/lib/wallet/send-registry-transaction';
import { WalletFlowError } from '@/lib/wallet/wallet-errors';
import { trackedTransactionSchema } from '../organization/organization.schema';
import {
  inspectionDetailSchema,
  inspectionRequestViewSchema,
  recordAuthorizationSchema,
} from './inspection.schema';

export const RECORD_STEPS = ['prepare', 'send', 'confirm'] as const;
export type RecordStep = (typeof RECORD_STEPS)[number];

/** Trang của nhà sản xuất (`products`) hay của chủ sở hữu (`owned-products`). */
export type RequesterScope = 'products' | 'owned-products';

const TIMEOUT_MESSAGE =
  'Giao dịch đã được gửi nhưng hệ thống chưa thấy xác nhận. Tải lại trang sau ít phút.';

/** INS-02: nhà sản xuất hoặc chủ sở hữu gửi yêu cầu tới đơn vị kiểm định đã chọn (không cần ví). */
export function requestInspection(
  scope: RequesterScope,
  productId: string,
  inspectorOrgId: string,
  note: string,
): Promise<InspectionRequestView> {
  return apiRequest(`/me/${scope}/${productId}/inspection-requests`, inspectionRequestViewSchema, {
    method: 'POST',
    body: { inspectorOrgId, note },
  });
}

/** INS-03: người gửi huỷ yêu cầu khi chưa có kết quả. */
export function cancelInspectionRequest(requestId: string): Promise<void> {
  return apiCommand(`/me/inspection-requests/${requestId}/cancel`);
}

/** INS-04: đơn vị kiểm định từ chối kèm lý do (không cần ví). */
export function declineInspection(requestId: string, reason: string): Promise<void> {
  return apiCommand(`/me/inspections/${requestId}/decline`, { reason });
}

export interface InspectionResultInput {
  result: InspectionResult;
  summary: string;
  file: File | null;
}

function stateIs(requestId: string, states: readonly InspectionRequestState[]) {
  return async () =>
    states.includes(
      (await apiRequest(`/me/inspections/${requestId}`, inspectionDetailSchema)).state,
    );
}

/**
 * INS-01: tải biên bản (kết quả, tóm tắt, file) lên API, nhận giấy phép khoá đúng kết quả và hash
 * biên bản; ví đơn vị kiểm định gửi recordInspection, web báo txHash rồi chờ Worker chốt.
 */
export async function recordInspection(
  requestId: string,
  input: InspectionResultInput,
  onStep: (step: RecordStep) => void,
): Promise<string> {
  const fileError = evidenceFileError(input.file);
  if (fileError) {
    throw new WalletFlowError(fileError);
  }
  onStep('prepare');
  const form = new FormData();
  form.set('result', input.result);
  form.set('summary', input.summary);
  if (input.file) {
    form.set('report', input.file);
  }
  const auth = await apiRequest(`/me/inspections/${requestId}/results`, recordAuthorizationSchema, {
    method: 'POST',
    body: form,
  });
  onStep('send');
  const txHash = await sendContractTransaction(INSPECTION_REGISTRY_ABI, {
    chainId: auth.chainId,
    contractAddress: auth.contractAddress,
    wallet: auth.wallet,
    method: 'recordInspection',
    args: [
      auth.inspectionId,
      auth.productId,
      auth.requesterId,
      auth.resultCode,
      auth.reportHash,
      BigInt(auth.deadline),
      auth.signature,
    ],
  });
  onStep('confirm');
  await apiRequest('/me/inspections/transactions', trackedTransactionSchema, {
    method: 'POST',
    body: { txHash },
  });
  await waitUntil(stateIs(requestId, ['COMPLETED']), TIMEOUT_MESSAGE);
  return txHash;
}
