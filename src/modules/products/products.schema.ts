import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(50),
  barcode: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().cuid(),
  supplierId: z.string().cuid().optional(),
  unit: z.string().default('piece'),
  costPrice: z.number().min(0),
  retailPrice: z.number().min(0),
  wholesalePrice: z.number().min(0),
  wholesaleMinQty: z.number().int().min(1).default(1),
  reorderLevel: z.number().int().min(0).default(10),
  reorderQty: z.number().int().min(1).default(50),
  maxStockLevel: z.number().int().min(1).default(500),
  taxRate: z.number().min(0).max(100).default(0),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  categoryId: z.string().cuid().optional(),
  supplierId: z.string().cuid().optional().nullable(),
  unit: z.string().optional(),
  retailPrice: z.number().min(0).optional(),
  wholesalePrice: z.number().min(0).optional(),
  wholesaleMinQty: z.number().int().min(1).optional(),
  reorderLevel: z.number().int().min(0).optional(),
  reorderQty: z.number().int().min(1).optional(),
  maxStockLevel: z.number().int().min(1).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

export const updateCostPriceSchema = z.object({
  newCostPrice: z.number().min(0),
  reason: z.string().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type UpdateCostPriceInput = z.infer<typeof updateCostPriceSchema>;
