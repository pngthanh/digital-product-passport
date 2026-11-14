import {
  ALERT_DECISIONS,
  ALERT_NOTE_MAX_LENGTH,
  ALERT_NOTE_MIN_LENGTH,
  ALERT_STATUSES,
  ANOMALY_SEVERITIES,
  type AlertSummary,
  type AnomalyAlertPage,
  type AnomalyAlertView,
  type AuditLogPage,
  type DashboardStatistics,
  OrgType,
  ProductState,
  WarrantyState,
} from '@dpp/shared';
import { z } from 'zod';
import { isoDateSchema } from '@/lib/chain-schema';

const count = z.number().int().nonnegative();
const uuid = z.uuid();
const digits = z.string().regex(/^\d+$/);

const actorSchema = z.object({ userId: uuid, fullName: z.string(), email: z.string() });
const metadataValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** `GET /admin/audit-logs` (AUD-01). */
export const auditLogPageSchema: z.ZodType<AuditLogPage> = z.object({
  items: z.array(
    z.object({
      id: uuid,
      action: z.string(),
      actor: actorSchema.nullable(),
      targetType: z.string(),
      targetId: z.string().nullable(),
      metadata: z.record(z.string(), z.unknown()).nullable(),
      ipAddress: z.string().nullable(),
      userAgent: z.string().nullable(),
      createdAt: isoDateSchema,
    }),
  ),
  nextCursor: uuid.nullable(),
});

/** Một cảnh báo (AUD-04). */
export const anomalyAlertSchema: z.ZodType<AnomalyAlertView> = z.object({
  id: uuid,
  ruleCode: z.string(),
  severity: z.enum(ANOMALY_SEVERITIES),
  status: z.enum(ALERT_STATUSES),
  detectedAt: isoDateSchema,
  product: z
    .object({
      id: uuid,
      serialNumber: z.string(),
      modelName: z.string(),
      publicCode: z.string(),
    })
    .nullable(),
  party: z
    .object({
      kind: z.enum(['ORGANIZATION', 'PERSON']),
      name: z.string(),
      email: z.string().nullable(),
    })
    .nullable(),
  details: z.record(z.string(), metadataValue),
  review: z
    .object({
      decision: z.enum(ALERT_DECISIONS),
      note: z.string().nullable(),
      by: actorSchema.nullable(),
      at: isoDateSchema,
    })
    .nullable(),
});

const statusCounts = z.object({ OPEN: count, ACKNOWLEDGED: count, DISMISSED: count });

/** `GET /admin/alerts`. */
export const anomalyAlertPageSchema: z.ZodType<AnomalyAlertPage> = z.object({
  items: z.array(anomalyAlertSchema),
  nextCursor: uuid.nullable(),
  counts: statusCounts,
});

/** `GET /admin/alerts/summary`: số cạnh mục Cảnh báo. */
export const alertSummarySchema: z.ZodType<AlertSummary> = z.object({
  open: count,
  openHigh: count,
});

function recordOf<const K extends string>(keys: readonly K[]) {
  return z.object(Object.fromEntries(keys.map((key) => [key, count])) as Record<K, typeof count>);
}

const stageCounts = recordOf(['DRAFT', 'PENDING', 'AUTHORIZED', 'REJECTED', 'DISABLED']);

/** `GET /admin/dashboard` (AUD-02). */
export const dashboardSchema: z.ZodType<DashboardStatistics> = z.object({
  generatedAt: isoDateSchema,
  accounts: z.object({ total: count, withWallet: count, admins: count }),
  organizations: z.object(
    Object.fromEntries(Object.values(OrgType).map((type) => [type, stageCounts])) as Record<
      OrgType,
      typeof stageCounts
    >,
  ),
  products: z.object({ drafts: count, byState: recordOf(Object.values(ProductState)) }),
  warranties: recordOf(Object.values(WarrantyState)),
  service: recordOf(['pending', 'inRepair', 'repaired', 'notRepaired']),
  inspections: recordOf(['pending', 'completed', 'declined']),
  transfers: recordOf(['pending', 'completed', 'rejected', 'cancelled', 'expired']),
  transactions: z.object({
    byStatus: recordOf(['QUEUED', 'SUBMITTED', 'CONFIRMED', 'REVERTED', 'FAILED']),
    methods: z.array(
      z.object({
        contractName: z.string(),
        method: z.string(),
        total: count,
        confirmed: count,
        reverted: count,
        averageGasUsed: digits.nullable(),
        averageConfirmSeconds: z.number().nonnegative().nullable(),
      }),
    ),
  }),
  activity: z.array(z.object({ day: z.iso.date(), events: count })),
  indexer: z.object({ behindBlocks: digits.nullable(), lastIndexedAt: isoDateSchema.nullable() }),
  alerts: recordOf(ANOMALY_SEVERITIES),
});

/** Form xử lý cảnh báo: cùng giới hạn với API (ghi chú 5–1000 ký tự sau khi bỏ khoảng trắng). */
export const reviewFormSchema = z.object({
  decision: z.enum(ALERT_DECISIONS, { error: 'Chọn Đã xử lý hoặc Báo nhầm' }),
  note: z
    .string()
    .transform((value) => value.normalize('NFC').trim())
    .pipe(
      z
        .string()
        .min(ALERT_NOTE_MIN_LENGTH, `Ghi chú tối thiểu ${ALERT_NOTE_MIN_LENGTH} ký tự`)
        .max(ALERT_NOTE_MAX_LENGTH, `Ghi chú tối đa ${ALERT_NOTE_MAX_LENGTH} ký tự`),
    ),
});
