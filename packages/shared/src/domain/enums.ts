import { defineEnum, type EnumValue } from './define-enum.js';

/*
 * Các enum dưới đây khớp 1-1 với PostgreSQL enum trong `apps/api/prisma/schema.prisma`.
 * Test `prisma-enums.spec.ts` của API kiểm tra sự khớp này để giữ traceability.
 */

// --- Tài khoản và tổ chức ---
export const SystemRole = defineEnum(['ADMIN', 'USER']);
export type SystemRole = EnumValue<typeof SystemRole>;

export const UserStatus = defineEnum(['ACTIVE', 'LOCKED', 'DELETED']);
export type UserStatus = EnumValue<typeof UserStatus>;

export const OrgType = defineEnum(['MANUFACTURER', 'RETAILER', 'SERVICE_CENTER', 'INSPECTOR']);
export type OrgType = EnumValue<typeof OrgType>;

export const AuthStatus = defineEnum(['PENDING', 'AUTHORIZED', 'REJECTED', 'DISABLED']);
export type AuthStatus = EnumValue<typeof AuthStatus>;

// --- Party và ví ---
export const PartyType = defineEnum(['USER', 'ORGANIZATION']);
export type PartyType = EnumValue<typeof PartyType>;

export const CustodyType = defineEnum(['CUSTODIAL', 'NON_CUSTODIAL']);
export type CustodyType = EnumValue<typeof CustodyType>;

export const WalletRole = defineEnum(['OWNER', 'OPERATIONAL', 'PERSONAL']);
export type WalletRole = EnumValue<typeof WalletRole>;

export const WalletStatus = defineEnum(['PENDING', 'ACTIVE', 'ROTATED', 'REVOKED']);
export type WalletStatus = EnumValue<typeof WalletStatus>;

// --- Phí MON ---
export const FeeAction = defineEnum(['ORG_REGISTRATION']);
export type FeeAction = EnumValue<typeof FeeAction>;

export const FeeStatus = defineEnum(['ESCROWED', 'SETTLED', 'REFUNDABLE', 'REFUNDED']);
export type FeeStatus = EnumValue<typeof FeeStatus>;

// --- 4 state machine độc lập ---
export const ProductState = defineEnum([
  'CREATED',
  'IN_DISTRIBUTION',
  'AT_RETAIL',
  'SOLD',
  'RECALLED',
  'LOST_STOLEN',
  'RETIRED',
]);
export type ProductState = EnumValue<typeof ProductState>;

/** Không có dòng bảo hành nghĩa là NOT_ACTIVATED; EXPIRED suy ra theo thời gian. */
export const WarrantyState = defineEnum(['ACTIVE', 'SUSPENDED', 'EXPIRED']);
export type WarrantyState = EnumValue<typeof WarrantyState>;

export const ServiceState = defineEnum([
  'REQUESTED',
  'IN_REPAIR',
  'REPAIRED',
  'REJECTED',
  'CANCELLED',
]);
export type ServiceState = EnumValue<typeof ServiceState>;

export const TransferState = defineEnum([
  'REQUESTED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
]);
export type TransferState = EnumValue<typeof TransferState>;

// --- Kiểm định ---
export const InspectionResult = defineEnum(['PASS', 'FAIL', 'CONDITIONAL']);
export type InspectionResult = EnumValue<typeof InspectionResult>;

// --- Đồng bộ on-chain ---
/** Trạng thái xác nhận của bản ghi [A+P] do Backend tạo trước khi giao dịch được ghi nhận. */
export const SyncStatus = defineEnum(['PENDING', 'CONFIRMED', 'FAILED']);
export type SyncStatus = EnumValue<typeof SyncStatus>;

export const TxStatus = defineEnum(['QUEUED', 'SUBMITTED', 'CONFIRMED', 'REVERTED', 'FAILED']);
export type TxStatus = EnumValue<typeof TxStatus>;

export const FinalityStatus = defineEnum(['PENDING', 'FINALIZED', 'ORPHANED']);
export type FinalityStatus = EnumValue<typeof FinalityStatus>;

// --- Thông báo và giám sát ---
export const NotificationChannel = defineEnum(['IN_APP', 'EMAIL']);
export type NotificationChannel = EnumValue<typeof NotificationChannel>;

export const NotificationStatus = defineEnum(['PENDING', 'SENT', 'FAILED']);
export type NotificationStatus = EnumValue<typeof NotificationStatus>;

export const AnomalySeverity = defineEnum(['LOW', 'MEDIUM', 'HIGH']);
export type AnomalySeverity = EnumValue<typeof AnomalySeverity>;

export const AlertStatus = defineEnum(['OPEN', 'ACKNOWLEDGED', 'DISMISSED']);
export type AlertStatus = EnumValue<typeof AlertStatus>;

/** Danh sách mọi enum dùng chung, phục vụ test đối chiếu với Prisma schema. */
export const DOMAIN_ENUMS = {
  SystemRole,
  UserStatus,
  OrgType,
  AuthStatus,
  PartyType,
  CustodyType,
  WalletRole,
  WalletStatus,
  FeeAction,
  FeeStatus,
  ProductState,
  WarrantyState,
  ServiceState,
  TransferState,
  InspectionResult,
  SyncStatus,
  TxStatus,
  FinalityStatus,
  NotificationChannel,
  NotificationStatus,
  AnomalySeverity,
  AlertStatus,
} as const;
