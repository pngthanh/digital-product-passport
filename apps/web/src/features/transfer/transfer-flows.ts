import {
  type ContractInfo,
  OWNERSHIP_TRANSFER_ABI,
  type OwnershipTransferMethod,
  type TransferRecipientPreview,
  type TransferRequestView,
} from '@dpp/shared';
import { apiRequest } from '@/lib/api-client';
import { sendContractTransaction, waitUntil } from '@/lib/wallet/send-registry-transaction';
import { trackedTransactionSchema } from '../organization/organization.schema';
import {
  myTransfersSchema,
  ownedProductTransferSchema,
  recipientPreviewSchema,
  transferAuthorizationSchema,
} from './transfer.schema';

export const TRANSFER_STEPS = ['prepare', 'send', 'confirm'] as const;
export type TransferStep = (typeof TRANSFER_STEPS)[number];

const TIMEOUT_MESSAGE =
  'Giao dịch đã được gửi nhưng hệ thống chưa thấy xác nhận. Tải lại trang sau ít phút.';

/** Tra bên nhận (email tài khoản cá nhân hoặc mã số thuế doanh nghiệp) trước khi tạo yêu cầu. */
export function previewRecipient(
  productId: string,
  recipient: string,
): Promise<TransferRecipientPreview> {
  return apiRequest(`/me/owned-products/${productId}/transfer-recipients`, recipientPreviewSchema, {
    method: 'POST',
    body: { recipient },
  });
}

async function reportAndSettle(txHash: string, settled: () => Promise<boolean>): Promise<void> {
  await apiRequest('/me/transfers/transactions', trackedTransactionSchema, {
    method: 'POST',
    body: { txHash },
  });
  await waitUntil(settled, TIMEOUT_MESSAGE);
}

/**
 * TRF-01: API kiểm tra bên nhận, thời hạn và ký giấy phép; ví chủ sở hữu gửi createTransferRequest,
 * web báo txHash rồi chờ Worker ghi yêu cầu.
 */
export async function createTransfer(
  productId: string,
  input: { recipient: string; days: number },
  onStep: (step: TransferStep) => void,
): Promise<string> {
  onStep('prepare');
  const auth = await apiRequest(
    `/me/owned-products/${productId}/transfer-authorizations`,
    transferAuthorizationSchema,
    { method: 'POST', body: input },
  );
  onStep('send');
  const txHash = await sendContractTransaction(OWNERSHIP_TRANSFER_ABI, {
    chainId: auth.chainId,
    contractAddress: auth.contractAddress,
    wallet: auth.wallet,
    method: 'createTransferRequest',
    args: [
      auth.productId,
      auth.toPartyId,
      BigInt(auth.expiresAt),
      BigInt(auth.deadline),
      auth.signature,
    ],
  });
  onStep('confirm');
  await reportAndSettle(txHash, async () => {
    const view = await apiRequest(
      `/me/owned-products/${productId}/transfer`,
      ownedProductTransferSchema,
    );
    return view.active?.createdTxHash.toLowerCase() === txHash.toLowerCase();
  });
  return txHash;
}

/** Hàm đóng một yêu cầu: bên nhận chấp nhận, từ chối; bên gửi huỷ; ai cũng đóng yêu cầu quá hạn. */
export type TransferAction = Extract<
  OwnershipTransferMethod,
  'acceptTransfer' | 'rejectTransfer' | 'cancelTransfer' | 'expireTransfer'
>;

/** Các nút người xem dùng được với một yêu cầu, theo vai (bên gửi, bên nhận) và hạn. */
export function transferActionsFor(request: TransferRequestView): readonly TransferAction[] {
  if (request.state !== 'REQUESTED') {
    return [];
  }
  if (request.expired) {
    return ['expireTransfer'];
  }
  return request.direction === 'INCOMING'
    ? ['acceptTransfer', 'rejectTransfer']
    : ['cancelTransfer'];
}

/** TRF-02..05: ví gửi thẳng tới OwnershipTransfer (không cần giấy phép), rồi chờ yêu cầu đóng. */
export async function closeTransfer(
  contract: ContractInfo,
  wallet: string,
  method: TransferAction,
  requestId: string,
  onStep: (step: TransferStep) => void,
): Promise<string> {
  onStep('send');
  const txHash = await sendContractTransaction(OWNERSHIP_TRANSFER_ABI, {
    chainId: contract.chainId,
    contractAddress: contract.address,
    wallet,
    method,
    args: [BigInt(requestId)],
  });
  onStep('confirm');
  await reportAndSettle(txHash, async () => {
    const closed = await apiRequest('/me/transfers?filter=CLOSED&pageSize=100', myTransfersSchema);
    return closed.items.some((item) => item.requestId === requestId);
  });
  return txHash;
}
