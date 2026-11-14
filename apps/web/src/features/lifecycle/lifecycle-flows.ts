import {
  type LifecycleState,
  type OwnedProductLifecycle,
  type OwnerLifecycleMethod,
  PRODUCT_LIFECYCLE_ABI,
  type ProductState,
} from '@dpp/shared';
import { apiRequest } from '@/lib/api-client';
import { sendContractTransaction, waitUntil } from '@/lib/wallet/send-registry-transaction';
import { trackedTransactionSchema } from '../organization/organization.schema';
import { productDetailSchema } from '../products/product.schema';
import { ownedProductLifecycleSchema, recallAuthorizationSchema } from './lifecycle.schema';

export const LIFECYCLE_STEPS = ['prepare', 'send', 'confirm'] as const;
export type LifecycleStep = (typeof LIFECYCLE_STEPS)[number];

const TIMEOUT_MESSAGE =
  'Giao dịch đã được gửi nhưng hệ thống chưa thấy xác nhận. Tải lại trang sau ít phút.';

/** Sản phẩm còn thu hồi được (giống `ProductLifecycle._isRecallable`). */
export function isRecallable(state: ProductState | null): boolean {
  return (
    state === 'CREATED' || state === 'IN_DISTRIBUTION' || state === 'AT_RETAIL' || state === 'SOLD'
  );
}

/** Trạng thái cuối mà mỗi hàm của chủ sở hữu đặt. */
export const OWNER_ACTION_STATE: Readonly<Record<OwnerLifecycleMethod, LifecycleState>> = {
  reportLostStolen: 'LOST_STOLEN',
  retireProduct: 'RETIRED',
};

async function report(txHash: string): Promise<void> {
  await apiRequest('/me/lifecycle/transactions', trackedTransactionSchema, {
    method: 'POST',
    body: { txHash },
  });
}

/**
 * RCL-01: API lưu lý do, ký giấy phép; ví nhà sản xuất gửi `recallProducts` cho cả lô, web báo
 * txHash rồi chờ Worker ghi trạng thái Bị thu hồi.
 */
export async function recallProducts(
  productIds: readonly string[],
  reason: string,
  onStep: (step: LifecycleStep) => void,
): Promise<string> {
  onStep('prepare');
  const auth = await apiRequest('/me/products/recall-authorizations', recallAuthorizationSchema, {
    method: 'POST',
    body: { productIds, reason },
  });
  onStep('send');
  const txHash = await sendContractTransaction(PRODUCT_LIFECYCLE_ABI, {
    chainId: auth.chainId,
    contractAddress: auth.contractAddress,
    wallet: auth.wallet,
    method: 'recallProducts',
    args: [auth.productIds, auth.reasonHash, BigInt(auth.deadline), auth.signature],
  });
  onStep('confirm');
  await report(txHash);
  const last = auth.products.at(-1)?.id;
  await waitUntil(async () => {
    if (!last) {
      return true;
    }
    const product = await apiRequest(`/me/products/${last}`, productDetailSchema);
    return product.productState === 'RECALLED';
  }, TIMEOUT_MESSAGE);
  return txHash;
}

/** LIF-01, LIF-02: ví chủ sở hữu gọi thẳng ProductLifecycle (không cần giấy phép), rồi chờ Worker. */
export async function ownerLifecycleAction(
  productId: string,
  view: OwnedProductLifecycle,
  method: OwnerLifecycleMethod,
  onStep: (step: LifecycleStep) => void,
): Promise<string> {
  if (!view.contract || !view.wallet) {
    throw new Error('Chưa đủ điều kiện để gửi giao dịch.');
  }
  onStep('send');
  const txHash = await sendContractTransaction(PRODUCT_LIFECYCLE_ABI, {
    chainId: view.contract.chainId,
    contractAddress: view.contract.address,
    wallet: view.wallet,
    method,
    args: [view.chainProductId],
  });
  onStep('confirm');
  await report(txHash);
  await waitUntil(async () => {
    const next = await apiRequest(
      `/me/owned-products/${productId}/lifecycle`,
      ownedProductLifecycleSchema,
    );
    return next.notice?.state === OWNER_ACTION_STATE[method];
  }, TIMEOUT_MESSAGE);
  return txHash;
}
