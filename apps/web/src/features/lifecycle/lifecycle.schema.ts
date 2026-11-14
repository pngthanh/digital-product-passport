import {
  type LifecycleNotice,
  NOTIFICATION_TYPES,
  OWNER_LIFECYCLE_METHODS,
  type MyNotifications,
  type NotificationSummary,
  type NotificationView,
  type OwnedProductLifecycle,
  type PublicLifecycleView,
  type RecallAuthorizationView,
} from '@dpp/shared';
import { z } from 'zod';
import {
  addressSchema as address,
  bytes32Schema as bytes32,
  isoDateSchema as isoDate,
} from '@/lib/chain-schema';

const contractSchema = z.object({ chainId: z.number().int().positive(), address });

/** Kiểm tra đúng hợp đồng dữ liệu của API trước khi hiển thị (không tin dữ liệu mạng). */
export const lifecycleNoticeSchema: z.ZodType<LifecycleNotice> = z.object({
  state: z.enum(['RECALLED', 'LOST_STOLEN', 'RETIRED']),
  at: isoDate.nullable(),
  txHash: bytes32.nullable(),
  recall: z.object({ reason: z.string(), reasonHash: bytes32, issuerName: z.string() }).nullable(),
});

export const publicLifecycleSchema: z.ZodType<PublicLifecycleView> = z.object({
  notice: lifecycleNoticeSchema.nullable(),
});

export const ownedProductLifecycleSchema: z.ZodType<OwnedProductLifecycle> = z.object({
  notice: lifecycleNoticeSchema.nullable(),
  blockedReason: z.string().nullable(),
  contract: contractSchema.nullable(),
  wallet: address.nullable(),
  chainProductId: bytes32,
  methods: z.array(z.enum(OWNER_LIFECYCLE_METHODS)),
});

export const recallAuthorizationSchema: z.ZodType<RecallAuthorizationView> = z.object({
  method: z.literal('recallProducts'),
  chainId: z.number().int().positive(),
  contractAddress: address,
  wallet: address,
  issuerId: bytes32,
  productIds: z.array(bytes32).min(1),
  reasonHash: bytes32,
  deadline: z.string().regex(/^\d+$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  products: z.array(z.object({ id: z.uuid(), serialNumber: z.string(), modelName: z.string() })),
});

export const notificationViewSchema: z.ZodType<NotificationView> = z.object({
  id: z.uuid(),
  type: z.enum(NOTIFICATION_TYPES),
  createdAt: isoDate,
  readAt: isoDate.nullable(),
  product: z.object({
    id: z.uuid(),
    publicCode: z.string(),
    serialNumber: z.string(),
    modelName: z.string(),
  }),
  organizationName: z.string().nullable(),
  reason: z.string().nullable(),
  result: z.string().nullable(),
  repaired: z.boolean().nullable(),
  forOrganization: z.boolean(),
});

export const myNotificationsSchema: z.ZodType<MyNotifications> = z.object({
  items: z.array(notificationViewSchema),
  total: z.number().int().nonnegative(),
  unread: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export const notificationSummarySchema: z.ZodType<NotificationSummary> = z.object({
  unread: z.number().int().nonnegative(),
});
