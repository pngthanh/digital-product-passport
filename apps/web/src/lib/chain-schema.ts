import type { ChainEventView } from '@dpp/shared';
import { z } from 'zod';

/** Kiểu dữ liệu on-chain dùng chung khi kiểm tra phản hồi của API. */
export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const isoDateSchema = z.iso.datetime({ offset: true });
export const weiSchema = z.string().regex(/^\d+$/);

export const chainEventSchema: z.ZodType<ChainEventView> = z.object({
  eventName: z.string(),
  txHash: bytes32Schema,
  blockNumber: z.string().regex(/^\d+$/),
  logIndex: z.number().int().nonnegative(),
  blockTimestamp: isoDateSchema,
  actorAddress: addressSchema.nullable(),
  args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
