/*
 * Hợp đồng dữ liệu của module Products (M5 đăng ký, M6 phân phối và bán), dùng chung cho API và Web.
 */

import type { ProductPassportMethod } from '../chain/product-passport.js';
import type {
  AuthStatus,
  InspectionResult,
  OrgType,
  ProductState,
  SyncStatus,
  WarrantyState,
} from '../domain/enums.js';
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
  /** Số tháng bảo hành của từng sản phẩm, khoá on-chain. */
  warrantyMonths: number[];
  /** Giây Unix, dạng chuỗi thập phân. */
  deadline: string;
  signature: string;
  /** Bản nháp vừa lưu, cùng thứ tự với `productIds`. */
  products: { id: string; serialNumber: string; publicCode: string }[];
}

/** Tổ chức (nhà sản xuất, nhà bán lẻ) mà người dùng đang đại diện. */
export interface ManufacturerInfo {
  organizationId: string;
  name: string;
  partyId: string;
  authStatus: AuthStatus;
  orgType: OrgType;
}

/** Tên tổ chức kèm partyId để đối chiếu với event on-chain. */
export interface OrganizationLabel {
  organizationId: string;
  name: string;
  partyId: string;
}

/** Bên giữ hàng hoặc một phía của bước giao nhận. Cá nhân không hiện tên (không lộ PII). */
export type PartyLabel =
  { kind: 'ORGANIZATION'; organization: OrganizationLabel } | { kind: 'PERSON'; isYou: boolean };

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
  /** Bên đang giữ hàng; `null` khi còn là bản nháp. */
  holder: PartyLabel | null;
  /** Nhà bán lẻ đang được giao tới (chỉ khi IN_DISTRIBUTION). */
  pendingRetailer: OrganizationLabel | null;
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

/** Bảo hành đọc từ warranties (chiếu từ WarrantyManager); trạng thái đã tính hết hạn theo giờ hiện tại. */
export interface WarrantyView {
  state: WarrantyState;
  months: number;
  activatedAt: string;
  expiresAt: string;
  activatedBy: OrganizationLabel | null;
  activationTxHash: string;
}

export const JOURNEY_STEP_KINDS = [
  'REGISTERED',
  'DISPATCHED',
  'DISPATCH_CANCELLED',
  'DISPATCH_REJECTED',
  'RECEIVED',
  'SOLD',
  'OWNERSHIP_TRANSFERRED',
  'WARRANTY_ACTIVATED',
  'SERVICE_OPENED',
  'SERVICE_REPAIRED',
  'SERVICE_REJECTED',
  'INSPECTED',
] as const;
export type JourneyStepKind = (typeof JOURNEY_STEP_KINDS)[number];

/** Một bước trên hành trình của sản phẩm, dựng từ event FINALIZED, kèm txHash để tra explorer. */
export interface JourneyStep {
  kind: JourneyStepKind;
  at: string;
  txHash: string;
  from: PartyLabel | null;
  to: PartyLabel | null;
  /** (M7) SERVICE_OPENED: còn bảo hành lúc mở phiếu; `false` là sửa ngoài bảo hành. */
  warrantyCovered?: boolean;
  /** (M8) INSPECTED: kết quả kiểm định. */
  inspectionResult?: InspectionResult;
}

/** `GET /me/products/:id`. */
export interface ProductDetail extends ProductSummary {
  description: string | null;
  issuer: OrganizationLabel;
  proof: ProductProof | null;
  warranty: WarrantyView | null;
  journey: JourneyStep[];
  /** Mọi event FINALIZED của sản phẩm, cũ nhất trước. */
  history: ChainEventView[];
}

/** Nhà bán lẻ đã duyệt, để nhà sản xuất chọn khi gửi hàng (DST-01). */
export interface RetailerOption {
  organizationId: string;
  name: string;
  taxCode: string;
  address: string | null;
  partyId: string;
}

/** `POST /me/inventory/:id/sale-authorizations`: giấy phép EIP-712 ProductSale cho DST-03. */
export interface ProductSaleAuthorization {
  method: Extract<ProductPassportMethod, 'sellAndActivateWarranty'>;
  chainId: number;
  contractAddress: string;
  wallet: string;
  /** productId on-chain. */
  productId: string;
  retailerId: string;
  buyerId: string;
  /** Giây Unix, dạng chuỗi thập phân. */
  deadline: string;
  signature: string;
  /** Người mua để nhà bán lẻ xác nhận trước khi ký; email đã che bớt. */
  buyer: { fullName: string; maskedEmail: string };
  warrantyMonths: number;
}

export type InventoryFilter = 'INCOMING' | 'IN_STOCK' | 'SOLD';

export interface InventoryItem extends ProductSummary {
  issuer: OrganizationLabel;
  /** Lúc bán (chỉ ở bộ lọc SOLD). */
  soldAt: string | null;
}

/** `GET /me/inventory`: kho hàng của nhà bán lẻ mà người dùng đại diện. */
export interface MyInventory {
  /** `null` khi người dùng không đại diện nhà bán lẻ nào. */
  retailer: ManufacturerInfo | null;
  contract: ContractInfo | null;
  items: InventoryItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<InventoryFilter, number>;
}

/** `GET /me/inventory/:id`. */
export interface InventoryDetail extends ProductDetail {
  soldAt: string | null;
}

/** Sản phẩm người dùng đang sở hữu (`GET /me/owned-products`). */
export interface OwnedProduct extends ProductSummary {
  issuer: OrganizationLabel;
  warranty: WarrantyView | null;
  acquiredAt: string;
}

export interface OwnedProductDetail extends OwnedProduct {
  description: string | null;
  proof: ProductProof | null;
  journey: JourneyStep[];
  history: ChainEventView[];
}

/** `GET /me/workspace`: menu theo vai trò của người dùng. */
export interface MyWorkspace {
  organization: {
    organizationId: string;
    name: string;
    orgType: OrgType;
    authStatus: AuthStatus;
  } | null;
  ownedProducts: number;
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
  holder: PartyLabel | null;
  /** Nhà bán lẻ đang được giao tới (chỉ khi IN_DISTRIBUTION). */
  pendingRetailer: { name: string } | null;
  /** Đã bán cho người dùng cuối; không trả thông tin người mua. */
  hasOwner: boolean;
  warranty: WarrantyView | null;
  proof: ProductProof;
  journey: JourneyStep[];
  history: ChainEventView[];
}
