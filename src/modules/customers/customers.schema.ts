import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  taxNumber: z.string().optional(),
  customerType: z.enum(['RETAIL', 'WHOLESALE']).default('RETAIL'),
  creditLimit: z.number().min(0).default(0),
  notes: z.string().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
