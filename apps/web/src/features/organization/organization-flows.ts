import type { OrganizationApplicationInput } from '@dpp/shared';
import { apiRequest } from '@/lib/api-client';
import { sendRegistryTransaction, waitUntil } from '@/lib/wallet/send-registry-transaction';
import {
  applicationAuthorizationSchema,
  myOrganizationSchema,
  trackedTransactionSchema,
} from './organization.schema';

export const APPLY_STEPS = ['save', 'send', 'confirm'] as const;
export type ApplyStep = (typeof APPLY_STEPS)[number];

/**
 * ORG-01 phía trình duyệt: lưu hồ sơ và nhận giấy phép, ví cá nhân gửi applyOrganization kèm phí,
 * rồi chờ Worker ghi nhận đơn đang chờ duyệt (block finalized).
 */
export async function applyOrganization(
  input: OrganizationApplicationInput,
  chainId: number,
  onStep: (step: ApplyStep) => void,
): Promise<void> {
  onStep('save');
  const authorization = await apiRequest(
    '/me/organization/application',
    applicationAuthorizationSchema,
    { method: 'POST', body: input },
  );

  onStep('send');
  const txHash = await sendRegistryTransaction({
    chainId,
    contractAddress: authorization.contractAddress,
    wallet: authorization.wallet,
    method: 'applyOrganization',
    args: [
      authorization.partyId,
      authorization.role,
      authorization.profileHash,
      BigInt(authorization.deadline),
      authorization.signature,
    ],
    value: BigInt(authorization.feeWei),
  });

  onStep('confirm');
  await apiRequest('/me/organization/transactions', trackedTransactionSchema, {
    method: 'POST',
    body: { txHash, kind: 'applyOrganization' },
  });
  await waitUntil(async () => {
    const view = await apiRequest('/me/organization', myOrganizationSchema);
    return view.organization?.stage === 'PENDING';
  }, 'Giao dịch đã được gửi nhưng hệ thống chưa thấy xác nhận. Tải lại trang sau ít phút.');
}

/** ORG-03: rút phí của đơn bị từ chối về ví cá nhân hiện tại của người đại diện. */
export async function withdrawRefund(options: {
  chainId: number;
  contractAddress: string;
  wallet: string;
  partyId: string;
}): Promise<void> {
  const txHash = await sendRegistryTransaction({
    chainId: options.chainId,
    contractAddress: options.contractAddress,
    wallet: options.wallet,
    method: 'withdrawRefund',
    args: [options.partyId],
  });
  await apiRequest('/me/organization/transactions', trackedTransactionSchema, {
    method: 'POST',
    body: { txHash, kind: 'withdrawRefund' },
  });
  await waitUntil(async () => {
    const view = await apiRequest('/me/organization', myOrganizationSchema);
    return view.organization?.refundableWei === '0';
  }, 'Giao dịch rút phí đã được gửi nhưng hệ thống chưa thấy xác nhận. Tải lại trang sau ít phút.');
}
