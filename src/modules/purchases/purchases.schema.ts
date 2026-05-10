import { z } from 'zod';

const purchaseItemSchema = z.object({
  productId: z.string().cuid(),
  orderedQty: z.number().int().positive(),
  unitCost: z.number().min(0),
  taxRate: z.number().min(0).max(100).default(0),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().cuid(),
  expectedDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1, 'At least one item is required'),
});

export const receivePurchaseSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().cuid(),
      receivedQty: z.number().int().nonnegative(),
    }),
  ).min(1),
  notes: z.string().optional(),
});

export const addPurchasePaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'CREDIT']),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type ReceivePurchaseInput = z.infer<typeof receivePurchaseSchema>;
export type AddPurchasePaymentInput = z.infer<typeof addPurchasePaymentSchema>;
