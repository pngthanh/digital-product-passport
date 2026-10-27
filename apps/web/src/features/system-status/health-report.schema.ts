import type { HealthReport } from '@dpp/shared';
import { z } from 'zod';

const healthStatusSchema = z.enum(['up', 'degraded', 'down']);

const componentHealthSchema = z.object({
  status: healthStatusSchema,
  latencyMs: z.number(),
  details: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
  error: z.string().optional(),
});

/** Không tin dữ liệu mạng: kiểm tra đúng hợp đồng `HealthReport` trước khi hiển thị. */
export const healthReportSchema: z.ZodType<HealthReport> = z.object({
  status: healthStatusSchema,
  service: z.string(),
  checkedAt: z.string(),
  components: z.record(z.string(), componentHealthSchema),
});
