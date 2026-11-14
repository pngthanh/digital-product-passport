/*
 * Hợp đồng dữ liệu của module Lifecycle (M10: thu hồi, báo mất, ngừng sử dụng), dùng chung cho API
 * và Web.
 */

import type { OwnerLifecycleMethod } from '../chain/product-lifecycle.js';
import type { ContractInfo } from './organizations.js';

/** Ba trạng thái cuối do ProductLifecycle đặt. */
export type LifecycleState = 'RECALLED' | 'LOST_STOLEN' | 'RETIRED';

/** `POST /me/products/recall-authorizations`: nhà sản xuất chọn sản phẩm và nhập lý do. */
export interface RecallPreparationInput {
  /** UUID sản phẩm (1 đến 50). */
  productIds: string[];
  reason: string;
}

/** Giấy phép EIP-712 RecallAuthorization; ví nhà sản xuất gửi `recallProducts`. */
export interface RecallAuthorizationView {
  method: 'recallProducts';
  chainId: number;
  contractAddress: string;
  /** Ví phải gửi giao dịch. */
  wallet: string;
  issuerId: string;
  /** productId on-chain, cùng thứ tự với `products`. */
  productIds: string[];
  reasonHash: string;
  /** Giây Unix, dạng chuỗi thập phân. */
  deadline: string;
  signature: string;
  products: { id: string; serialNumber: string; modelName: string }[];
}

/**
 * Sản phẩm đã ở trạng thái cuối: thu hồi (kèm lý do của nhà sản xuất), báo mất hoặc ngừng sử dụng.
 * Không chứa thông tin của chủ sở hữu.
 */
export interface LifecycleNotice {
  state: LifecycleState;
  /** `null` khi CSDL đã có trạng thái nhưng chưa có event của ProductLifecycle (hiếm). */
  at: string | null;
  txHash: string | null;
  recall: {
    reason: string;
    reasonHash: string;
    issuerName: string;
  } | null;
}

/** `GET /public/products/:code/lifecycle`: ai cũng xem được. */
export interface PublicLifecycleView {
  notice: LifecycleNotice | null;
}

/** `GET /me/owned-products/:id/lifecycle`: khung báo mất, ngừng sử dụng trên trang sản phẩm đã mua. */
export interface OwnedProductLifecycle {
  notice: LifecycleNotice | null;
  /** `null` khi báo mất, ngừng sử dụng được; ngược lại là lý do chưa làm được. */
  blockedReason: string | null;
  contract: ContractInfo | null;
  /** Ví đang dùng của người xem (chữ thường); `null` khi chưa liên kết. */
  wallet: string | null;
  /** productId on-chain, tham số của `reportLostStolen`, `retireProduct`. */
  chainProductId: string;
  methods: OwnerLifecycleMethod[];
}
