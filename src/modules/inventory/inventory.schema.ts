import { z } from 'zod';

export const adjustStockSchema = z.object({
  productId: z.string().cuid(),
  movementType: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'OPENING_STOCK']),
  quantity: z.number().int().positive(),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
