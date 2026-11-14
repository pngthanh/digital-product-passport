import {
  ALERT_DECISIONS,
  ALERT_NOTE_MAX_LENGTH,
  ALERT_NOTE_MIN_LENGTH,
  ALERT_STATUSES,
  ANOMALY_RULES,
  ANOMALY_SEVERITIES,
  AUDIT_ACTIONS,
} from '@dpp/shared';
import { z } from 'zod';

const DAY_MS = 86_400_000;
/** Ngày lọc tính theo giờ Việt Nam (UTC+7, không có giờ mùa hè). */
const VIETNAM_OFFSET = '+07:00';

/** Ngày có thật trên lịch (từ chối 2026-13-01, 2026-02-30). */
const day = z.iso.date('Ngày dạng YYYY-MM-DD');
const uuid = z.uuid();

function startOfDay(value: string): Date {
  return new Date(`${value}T00:00:00${VIETNAM_OFFSET}`);
}

/** `GET /admin/audit-logs`: `from`, `to` là ngày (gồm cả ngày `to`). */
export const auditLogQuerySchema = z
  .object({
    action: z.enum(AUDIT_ACTIONS).optional(),
    actorEmail: z.email().max(254).optional(),
    targetType: z.string().trim().min(1).max(64).optional(),
    targetId: z.string().trim().min(1).max(100).optional(),
    from: day.optional(),
    to: day.optional(),
    cursor: uuid.optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
    path: ['from'],
  })
  .transform(({ from, to, cursor, actorEmail, ...rest }) => ({
    ...rest,
    actorEmail: actorEmail?.toLowerCase(),
    from: from ? startOfDay(from) : undefined,
    to: to ? new Date(startOfDay(to).getTime() + DAY_MS) : undefined,
    before: cursor,
  }));

/** `GET /admin/alerts`. */
export const alertListQuerySchema = z
  .object({
    status: z.enum(ALERT_STATUSES).default('OPEN'),
    severity: z.enum(ANOMALY_SEVERITIES).optional(),
    rule: z.enum(ANOMALY_RULES).optional(),
    cursor: uuid.optional(),
  })
  .transform(({ rule, cursor, ...rest }) => ({ ...rest, ruleCode: rule, before: cursor }));

/** `POST /admin/alerts/:id/review`: ghi chú chuẩn hoá NFC, bỏ khoảng trắng đầu cuối. */
export const reviewAlertSchema = z.object({
  decision: z.enum(ALERT_DECISIONS),
  note: z
    .string()
    .transform((value) => value.normalize('NFC').replace(/\r\n?/g, '\n').trim())
    .pipe(
      z
        .string()
        .min(ALERT_NOTE_MIN_LENGTH, `Ghi chú tối thiểu ${ALERT_NOTE_MIN_LENGTH} ký tự`)
        .max(ALERT_NOTE_MAX_LENGTH, `Ghi chú tối đa ${ALERT_NOTE_MAX_LENGTH} ký tự`),
    ),
});

export const alertIdSchema = uuid;
