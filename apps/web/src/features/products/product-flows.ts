import {
  PRODUCT_PASSPORT_ABI,
  type ProductInput,
  type ProductRegistrationAuthorization,
} from '@dpp/shared';
import { apiDelete, apiRequest } from '@/lib/api-client';
import { sendContractTransaction, waitUntil } from '@/lib/wallet/send-registry-transaction';
import { trackedTransactionSchema } from '../organization/organization.schema';
import { productDetailSchema, registrationAuthorizationSchema } from './product.schema';

export const REGISTER_STEPS = ['save', 'send', 'confirm'] as const;
export type RegisterStep = (typeof REGISTER_STEPS)[number];

export type RegisteredProduct = ProductRegistrationAuthorization['products'][number];

const TIMEOUT_MESSAGE =
  'Giao dịch đã được gửi nhưng hệ thống chưa thấy xác nhận. Tải lại trang sau ít phút.';

/** Ví cá nhân gửi registerProducts theo giấy phép, rồi chờ Worker chốt (block finalized). */
async function sendAndConfirm(
  authorization: ProductRegistrationAuthorization,
  chainId: number,
  onStep: (step: RegisterStep) => void,
): Promise<RegisteredProduct[]> {
  onStep('send');
  const txHash = await sendContractTransaction(PRODUCT_PASSPORT_ABI, {
    chainId,
    contractAddress: authorization.contractAddress,
    wallet: authorization.wallet,
    method: 'registerProducts',
    args: [
      authorization.issuerId,
      authorization.productIds,
      authorization.metadataHashes,
      authorization.warrantyMonths,
      BigInt(authorization.deadline),
      authorization.signature,
    ],
  });

  onStep('confirm');
  await apiRequest('/me/products/transactions', trackedTransactionSchema, {
    method: 'POST',
    body: { txHash },
  });
  const [first] = authorization.products;
  if (first) {
    // Cả lô nằm trong một giao dịch nên được chốt cùng lúc.
    await waitUntil(async () => {
      const detail = await apiRequest(`/me/products/${first.id}`, productDetailSchema);
      return detail.syncStatus === 'CONFIRMED';
    }, TIMEOUT_MESSAGE);
  }
  return authorization.products;
}

/**
 * PRD-01, PRD-02 phía trình duyệt: lưu hồ sơ thành bản nháp và nhận giấy phép, ví cá nhân gửi
 * một giao dịch cho cả lô, rồi chờ hệ thống ghi nhận. Ví từ chối ký thì bản nháp vẫn còn để gửi lại.
 */
export async function registerProducts(
  items: readonly ProductInput[],
  chainId: number,
  onStep: (step: RegisterStep) => void,
  /** Gọi khi hồ sơ đã lưu thành bản nháp, trước khi ví ký: để gửi lại nếu bước sau lỗi. */
  onSaved?: (drafts: RegisteredProduct[]) => void,
): Promise<RegisteredProduct[]> {
  onStep('save');
  const authorization = await apiRequest(
    '/me/products/registrations',
    registrationAuthorizationSchema,
    { method: 'POST', body: { items } },
  );
  onSaved?.(authorization.products);
  return sendAndConfirm(authorization, chainId, onStep);
}

/** Gửi lại các bản nháp chưa lên blockchain với giấy phép mới. */
export async function retryProducts(
  productIds: readonly string[],
  chainId: number,
  onStep: (step: RegisterStep) => void,
): Promise<RegisteredProduct[]> {
  onStep('save');
  const authorization = await apiRequest(
    '/me/products/registrations/retry',
    registrationAuthorizationSchema,
    { method: 'POST', body: { productIds } },
  );
  return sendAndConfirm(authorization, chainId, onStep);
}

export function deleteProductDraft(productId: string): Promise<void> {
  return apiDelete(`/me/products/${productId}`);
}

/** Nhãn các bước khi ghi `count` sản phẩm. */
export function registerStepLabels(count: number): Record<RegisterStep, string> {
  const what = count === 1 ? 'sản phẩm' : `${count} sản phẩm`;
  return {
    save: `Lưu hồ sơ ${what} và nhận giấy phép`,
    send: `Ví cá nhân gửi registerProducts cho ${what} trong một giao dịch, tự trả gas`,
    confirm: 'Chờ block finalized và hệ thống ghi nhận',
  };
}
