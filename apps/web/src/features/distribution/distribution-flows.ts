import {
  PRODUCT_PASSPORT_ABI,
  type ProductPassportMethod,
  type ProductSaleAuthorization,
  type ProductState,
} from '@dpp/shared';
import { apiRequest } from '@/lib/api-client';
import { sendContractTransaction, waitUntil } from '@/lib/wallet/send-registry-transaction';
import { trackedTransactionSchema } from '../organization/organization.schema';
import {
  inventoryDetailSchema,
  myInventorySchema,
  productDetailSchema,
  saleAuthorizationSchema,
} from '../products/product.schema';

export const CUSTODY_STEPS = ['send', 'confirm'] as const;
export type CustodyStep = (typeof CUSTODY_STEPS)[number];

const TIMEOUT_MESSAGE =
  'Giao dịch đã được gửi nhưng hệ thống chưa thấy xác nhận. Tải lại trang sau ít phút.';

/** Ví và contract dùng chung cho mọi thao tác trên một sản phẩm. */
export interface PassportTarget {
  chainId: number;
  contractAddress: string;
  /** Ví cá nhân đã liên kết của người đại diện. */
  wallet: string;
  /** UUID sản phẩm trong hệ thống. */
  productId: string;
  /** productId (bytes32) on-chain. */
  chainProductId: string;
}

/**
 * Ví cá nhân gửi một hàm của ProductPassport, web báo txHash cho API rồi chờ Worker chốt
 * (block finalized) tới khi `settled` đúng.
 */
async function sendAndSettle(
  target: PassportTarget,
  method: ProductPassportMethod,
  args: readonly unknown[],
  reportPath: '/me/products/transactions' | '/me/inventory/transactions',
  settled: () => Promise<boolean>,
  onStep: (step: CustodyStep) => void,
): Promise<string> {
  onStep('send');
  const txHash = await sendContractTransaction(PRODUCT_PASSPORT_ABI, {
    chainId: target.chainId,
    contractAddress: target.contractAddress,
    wallet: target.wallet,
    method,
    args,
  });
  onStep('confirm');
  await apiRequest(reportPath, trackedTransactionSchema, { method: 'POST', body: { txHash } });
  await waitUntil(settled, TIMEOUT_MESSAGE);
  return txHash;
}

function makerStateIs(productId: string, state: ProductState) {
  return async () =>
    (await apiRequest(`/me/products/${productId}`, productDetailSchema)).productState === state;
}

function retailerStateIs(productId: string, state: ProductState) {
  return async () =>
    (await apiRequest(`/me/inventory/${productId}`, inventoryDetailSchema)).productState === state;
}

/** DST-01: nhà sản xuất gửi hàng cho nhà bán lẻ `retailerPartyId`. */
export function dispatchProduct(
  target: PassportTarget,
  retailerPartyId: string,
  onStep: (step: CustodyStep) => void,
): Promise<string> {
  return sendAndSettle(
    target,
    'dispatchCustody',
    [target.chainProductId, retailerPartyId],
    '/me/products/transactions',
    makerStateIs(target.productId, 'IN_DISTRIBUTION'),
    onStep,
  );
}

/** Nhà sản xuất huỷ lô gửi khi nhà bán lẻ chưa nhận. */
export function cancelDispatch(
  target: PassportTarget,
  onStep: (step: CustodyStep) => void,
): Promise<string> {
  return sendAndSettle(
    target,
    'cancelDispatch',
    [target.chainProductId],
    '/me/products/transactions',
    makerStateIs(target.productId, 'CREATED'),
    onStep,
  );
}

/** DST-02: nhà bán lẻ xác nhận đã nhận hàng. */
export function confirmReceipt(
  target: PassportTarget,
  onStep: (step: CustodyStep) => void,
): Promise<string> {
  return sendAndSettle(
    target,
    'confirmCustodyReceipt',
    [target.chainProductId],
    '/me/inventory/transactions',
    retailerStateIs(target.productId, 'AT_RETAIL'),
    onStep,
  );
}

/** Nhà bán lẻ từ chối nhận; xong thì sản phẩm không còn trong danh sách chờ nhận của cửa hàng. */
export function rejectReceipt(
  target: PassportTarget,
  onStep: (step: CustodyStep) => void,
): Promise<string> {
  return sendAndSettle(
    target,
    'rejectCustodyReceipt',
    [target.chainProductId],
    '/me/inventory/transactions',
    async () => {
      const incoming = await apiRequest(
        '/me/inventory?filter=INCOMING&pageSize=100',
        myInventorySchema,
      );
      return !incoming.items.some((item) => item.id === target.productId);
    },
    onStep,
  );
}

/** DST-03 bước 1: tìm tài khoản người mua và nhận giấy phép bán. */
export function prepareSale(
  productId: string,
  buyerEmail: string,
): Promise<ProductSaleAuthorization> {
  return apiRequest(`/me/inventory/${productId}/sale-authorizations`, saleAuthorizationSchema, {
    method: 'POST',
    body: { buyerEmail },
  });
}

/** DST-03 bước 2: ví nhà bán lẻ gửi sellAndActivateWarranty theo giấy phép. */
export function sellProduct(
  target: PassportTarget,
  sale: ProductSaleAuthorization,
  onStep: (step: CustodyStep) => void,
): Promise<string> {
  return sendAndSettle(
    { ...target, contractAddress: sale.contractAddress, wallet: sale.wallet },
    'sellAndActivateWarranty',
    [sale.productId, sale.buyerId, BigInt(sale.deadline), sale.signature],
    '/me/inventory/transactions',
    retailerStateIs(target.productId, 'SOLD'),
    onStep,
  );
}
