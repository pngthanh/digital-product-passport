/*
 * Hợp đồng dữ liệu của module Products (M5), dùng chung cho API và Web.
 */

import type { ProductPassportMethod } from '../chain/product-passport.js';
import type { AuthStatus, OrgType, ProductState, SyncStatus } from '../domain/enums.js';
import type { ChainEventView } from './chain.js';
import type { ContractInfo } from './organizations.js';

/** Một sản phẩm người dùng nhập (form hoặc một dòng CSV). */
export interface ProductInput {
  serialNumber: string;
  modelName: string;
  description?: string | null;
  /** YYYY-MM-DD. */
  manufacturedOn: string;
  warrantyMonths: number;
}

/** `POST /me/products/registrations`: 1–50 sản phẩm, đăng ký trong một giao dịch. */
export interface ProductRegistrationRequest {
  items: ProductInput[];
}

/** `POST /me/products/registrations/retry`: gửi lại các bản nháp chưa ghi lên blockchain. */
export interface ProductRetryRequest {
  productIds: string[];
}

/** Giấy phép EIP-712 để ví cá nhân của người đại diện tự gửi `registerProducts`. */
export interface ProductRegistrationAuthorization {
  method: ProductPassportMethod;
  chainId: number;
  contractAddress: string;
  /** Ví phải gửi giao dịch. */
  wallet: string;
  /** partyId của nhà sản xuất. */
  issuerId: string;
  productIds: string[];
  metadataHashes: string[];
  /** Giây Unix, dạng chuỗi thập phân. */
  deadline: string;
  signature: string;
  /** Bản nháp vừa lưu, cùng thứ tự với `productIds`. */
  products: { id: string; serialNumber: string; publicCode: string }[];
}

/** Nhà sản xuất mà người dùng đang đại diện. */
export interface ManufacturerInfo {
  organizationId: string;
  name: string;
  partyId: string;
  authStatus: AuthStatus;
  orgType: OrgType;
}

export interface ProductSummary {
  id: string;
  publicCode: string;
  serialNumber: string;
  modelName: string;
  manufacturedOn: string;
  warrantyMonths: number;
  /** `null` khi còn là bản nháp chưa ghi lên blockchain. */
  productState: ProductState | null;
  syncStatus: SyncStatus;
  chainProductId: string;
  metadataHash: string;
  createdTxHash: string | null;
  onchainCreatedAt: string | null;
  createdAt: string;
}

export type ProductListFilter = 'ALL' | 'REGISTERED' | 'DRAFT';

/** `GET /me/products`. */
export interface MyProductList {
  /** `null` khi người dùng không đại diện nhà sản xuất nào. */
  manufacturer: ManufacturerInfo | null;
  /** `null` khi API chưa cấu hình ProductPassport. */
  contract: ContractInfo | null;
  items: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<ProductListFilter, number>;
}

/** Kết quả đối chiếu hồ sơ với blockchain. */
export interface ProductProof {
  chainId: number;
  contractAddress: string;
  productId: string;
  metadataHash: string;
  /** Băm lại hồ sơ đang hiển thị có ra đúng `metadataHash` không. */
  metadataMatchesHash: boolean;
  /**
   * Đọc trực tiếp `ProductPassport.product()` lúc tải trang: hash và nhà phát hành trên chain có khớp
   * không; `null` khi chưa đọc được RPC.
   */
  onchainMatches: boolean | null;
  registrationTxHash: string | null;
  registeredAt: string | null;
}

/** `GET /me/products/:id`. */
export interface ProductDetail extends ProductSummary {
  description: string | null;
  issuer: { organizationId: string; name: string; partyId: string };
  proof: ProductProof | null;
  /** Mọi event FINALIZED của sản phẩm, cũ nhất trước. */
  history: ChainEventView[];
}

/** `GET /public/products/:code`: hộ chiếu công khai, chỉ có khi sản phẩm đã ghi lên blockchain. */
export interface PublicPassportView {
  publicCode: string;
  serialNumber: string;
  modelName: string;
  description: string | null;
  manufacturedOn: string;
  warrantyMonths: number;
  productState: ProductState;
  issuer: {
    name: string;
    taxCode: string;
    orgType: OrgType;
    authStatus: AuthStatus;
    partyId: string;
  };
  /** Bên đang giữ hàng. */
  custodian: { name: string } | null;
  proof: ProductProof;
  history: ChainEventView[];
}
