import {
  type AuthStatus,
  type ProductState,
  VERIFICATION_CHECKS,
  type VerificationCheck,
  type VerificationCheckKey,
  type VerificationStatus,
} from '@dpp/shared';

/** Bảo hành theo cùng một dạng cho CSDL và WarrantyManager; thời điểm làm tròn tới giây. */
export interface WarrantyFacts {
  activatedByPartyId: string;
  activatedAt: Date;
  expiresAt: Date;
  suspended: boolean;
}

/** Dữ liệu hệ thống của sản phẩm; partyId là bytes32 chữ thường (`null` khi không có bên đó). */
export interface RecordedPassport {
  metadataHash: string;
  issuerPartyId: string;
  issuerStatus: AuthStatus;
  productState: ProductState;
  warrantyMonths: number;
  custodianPartyId: string | null;
  pendingCustodianPartyId: string | null;
  ownerPartyId: string | null;
  warranty: WarrantyFacts | null;
}

/** `ProductPassport.product()` tại block đối chiếu; `productState` `null` là chưa đăng ký. */
export interface ChainPassport {
  metadataHash: string;
  issuerPartyId: string;
  productState: ProductState | null;
  warrantyMonths: number;
  custodianPartyId: string | null;
  pendingCustodianPartyId: string | null;
  ownerPartyId: string | null;
}

/** Kết quả đọc một contract: giá trị, chưa so được vì có giao dịch mới hơn mốc, hoặc lỗi RPC. */
export type ChainRead<T> =
  { kind: 'read'; value: T } | { kind: 'syncing' } | { kind: 'unavailable' };

export interface ChainFacts {
  passport: ChainRead<ChainPassport>;
  /** `null` trong `value` là chưa kích hoạt bảo hành. */
  warranty: ChainRead<WarrantyFacts | null>;
  /** `null` trong `value` là PartyRegistry không có tổ chức này. */
  issuerStatus: ChainRead<AuthStatus | null>;
}

function sameSecond(left: Date, right: Date): boolean {
  return Math.floor(left.getTime() / 1000) === Math.floor(right.getTime() / 1000);
}

/**
 * Bảo hành khớp khi cùng bên kích hoạt, ngày kích hoạt và hạn; cờ tạm dừng chỉ so khi chưa hết hạn
 * (hết hạn theo thời gian kể cả khi đang tạm dừng, D10).
 */
export function warrantyMatches(
  recorded: WarrantyFacts | null,
  chain: WarrantyFacts | null,
  now: Date,
): boolean {
  if (!recorded || !chain) {
    return recorded === chain;
  }
  if (
    recorded.activatedByPartyId !== chain.activatedByPartyId ||
    !sameSecond(recorded.activatedAt, chain.activatedAt) ||
    !sameSecond(recorded.expiresAt, chain.expiresAt)
  ) {
    return false;
  }
  return now.getTime() >= chain.expiresAt.getTime() || recorded.suspended === chain.suspended;
}

function statusOf<T>(read: ChainRead<T>, matches: (value: T) => boolean): VerificationStatus {
  switch (read.kind) {
    case 'syncing':
      return 'SYNCING';
    case 'unavailable':
      return 'UNAVAILABLE';
    default:
      return matches(read.value) ? 'MATCH' : 'MISMATCH';
  }
}

/** So từng mục (thứ tự theo VERIFICATION_CHECKS). */
export function compareChecks(
  recorded: RecordedPassport,
  chain: ChainFacts,
  now: Date,
): VerificationCheck[] {
  const passport = (matches: (value: ChainPassport) => boolean) =>
    statusOf(chain.passport, matches);
  const checks: Record<VerificationCheckKey, VerificationStatus> = {
    PROFILE: passport(
      (value) =>
        value.productState !== null &&
        value.metadataHash === recorded.metadataHash &&
        value.issuerPartyId === recorded.issuerPartyId &&
        value.warrantyMonths === recorded.warrantyMonths,
    ),
    ISSUER: statusOf(chain.issuerStatus, (status) => status === recorded.issuerStatus),
    STATE: passport((value) => value.productState === recorded.productState),
    CUSTODY: passport(
      (value) =>
        value.custodianPartyId === recorded.custodianPartyId &&
        value.pendingCustodianPartyId === recorded.pendingCustodianPartyId,
    ),
    OWNER: passport((value) => value.ownerPartyId === recorded.ownerPartyId),
    WARRANTY: statusOf(chain.warranty, (value) => warrantyMatches(recorded.warranty, value, now)),
  };
  return VERIFICATION_CHECKS.map((key) => ({ key, status: checks[key] }));
}

/** Lệch thì báo lệch; chưa đọc được hay đang cập nhật thì chưa kết luận; còn lại là khớp. */
export function overallStatus(checks: readonly VerificationCheck[]): VerificationStatus {
  const statuses = new Set(checks.map((check) => check.status));
  for (const status of ['MISMATCH', 'UNAVAILABLE', 'SYNCING'] as const) {
    if (statuses.has(status)) {
      return status;
    }
  }
  return 'MATCH';
}
