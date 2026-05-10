import { z } from 'zod';

const saleItemSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().positive(),
  discount: z.number().min(0).default(0), // per-item discount amount
});

export const createSaleOrderSchema = z.object({
  customerId: z.string().cuid().optional(),
  customerType: z.enum(['RETAIL', 'WHOLESALE']).default('RETAIL'),
  notes: z.string().optional(),
  items: z.array(saleItemSchema).min(1, 'At least one item is required'),
  // Discount at order level
  discountAmount: z.number().min(0).default(0),
});

export const addSalePaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'CREDIT']),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

const returnItemSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().positive(),
  restocked: z.boolean().default(true),
});

export const createSaleReturnSchema = z.object({
  reason: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(returnItemSchema).min(1),
});

export type CreateSaleOrderInput = z.infer<typeof createSaleOrderSchema>;
export type AddSalePaymentInput = z.infer<typeof addSalePaymentSchema>;
export type CreateSaleReturnInput = z.infer<typeof createSaleReturnSchema>;
