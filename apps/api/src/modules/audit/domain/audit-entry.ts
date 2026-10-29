import type { ClientContext } from '../../../common/domain/client-context.js';

/** Hành động được ghi vào audit_logs. Mã ổn định để màn hình kiểm toán (M12) lọc theo. */
export const AuditAction = {
  ACCOUNT_REGISTERED: 'ACCOUNT_REGISTERED',
  SIGNED_IN: 'SIGNED_IN',
  SIGN_IN_FAILED: 'SIGN_IN_FAILED',
  SIGNED_OUT: 'SIGNED_OUT',
  WALLET_LINK_AUTHORIZED: 'WALLET_LINK_AUTHORIZED',
  WALLET_LINK_SUBMITTED: 'WALLET_LINK_SUBMITTED',
  WALLET_ACTIVATED: 'WALLET_ACTIVATED',
  WALLET_ROTATED: 'WALLET_ROTATED',
  ORG_APPLICATION_AUTHORIZED: 'ORG_APPLICATION_AUTHORIZED',
  ORG_TRANSACTION_SUBMITTED: 'ORG_TRANSACTION_SUBMITTED',
  ORG_APPLIED: 'ORG_APPLIED',
  ORG_APPROVED: 'ORG_APPROVED',
  ORG_REJECTED: 'ORG_REJECTED',
  ORG_DISABLED: 'ORG_DISABLED',
  ORG_FEE_REFUNDED: 'ORG_FEE_REFUNDED',
  FEE_POLICY_UPDATED: 'FEE_POLICY_UPDATED',
  ADMIN_DECISION_PREPARED: 'ADMIN_DECISION_PREPARED',
  ADMIN_TRANSACTION_SUBMITTED: 'ADMIN_TRANSACTION_SUBMITTED',
  PRODUCT_REGISTRATION_AUTHORIZED: 'PRODUCT_REGISTRATION_AUTHORIZED',
  PRODUCT_TRANSACTION_SUBMITTED: 'PRODUCT_TRANSACTION_SUBMITTED',
  PRODUCT_REGISTERED: 'PRODUCT_REGISTERED',
  PRODUCT_DRAFT_DELETED: 'PRODUCT_DRAFT_DELETED',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/** Giá trị đơn giản để lưu thẳng vào cột metadata (JSONB). */
export type AuditMetadataValue = string | number | boolean | null;

export interface AuditEntry {
  action: AuditAction;
  /** `null` khi chưa xác định được người dùng (đăng nhập sai, event từ blockchain). */
  actorUserId: string | null;
  targetType: string;
  targetId: string | null;
  metadata?: Readonly<Record<string, AuditMetadataValue>>;
  client?: ClientContext;
}
