import { createProductSchema, updateCostPriceSchema } from '../modules/products/products.schema';
import { createSaleOrderSchema } from '../modules/sales/sales.schema';
import { adjustStockSchema } from '../modules/inventory/inventory.schema';

describe('Product schema validation', () => {
  it('should validate a valid product', () => {
    const result = createProductSchema.safeParse({
      name: 'Test Product',
      sku: 'TEST-001',
      categoryId: 'clxxxxxxxxxxxxxxxxxxxxxxxx',
      costPrice: 100,
      retailPrice: 150,
      wholesalePrice: 130,
    });
    expect(result.success).toBe(true);
  });

  it('should reject negative prices', () => {
    const result = createProductSchema.safeParse({
      name: 'Test Product',
      sku: 'TEST-001',
      categoryId: 'clxxxxxxxxxxxxxxxxxxxxxxxx',
      costPrice: -10,
      retailPrice: 150,
      wholesalePrice: 130,
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional barcode', () => {
    const result = createProductSchema.safeParse({
      name: 'Test Product',
      sku: 'TEST-002',
      barcode: 'MY-BARCODE-123',
      categoryId: 'clxxxxxxxxxxxxxxxxxxxxxxxx',
      costPrice: 50,
      retailPrice: 80,
      wholesalePrice: 70,
    });
    expect(result.success).toBe(true);
  });
});

describe('Cost price update schema', () => {
  it('should validate positive new cost', () => {
    const result = updateCostPriceSchema.safeParse({ newCostPrice: 250 });
    expect(result.success).toBe(true);
  });

  it('should reject negative cost', () => {
    const result = updateCostPriceSchema.safeParse({ newCostPrice: -1 });
    expect(result.success).toBe(false);
  });
});

describe('Sale order schema validation', () => {
  it('should validate a complete sale order', () => {
    const result = createSaleOrderSchema.safeParse({
      customerType: 'RETAIL',
      items: [
        { productId: 'clxxxxxxxxxxxxxxxxxxxxxxxx', quantity: 2 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should reject sale with no items', () => {
    const result = createSaleOrderSchema.safeParse({
      customerType: 'RETAIL',
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative quantity', () => {
    const result = createSaleOrderSchema.safeParse({
      customerType: 'RETAIL',
      items: [{ productId: 'clxxxxxxxxxxxxxxxxxxxxxxxx', quantity: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it('should default customerType to RETAIL', () => {
    const result = createSaleOrderSchema.safeParse({
      items: [{ productId: 'clxxxxxxxxxxxxxxxxxxxxxxxx', quantity: 1 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customerType).toBe('RETAIL');
    }
  });
});

describe('Stock adjustment schema', () => {
  it('should validate an adjustment', () => {
    const result = adjustStockSchema.safeParse({
      productId: 'clxxxxxxxxxxxxxxxxxxxxxxxx',
      movementType: 'ADJUSTMENT_IN',
      quantity: 10,
      reason: 'Physical count correction',
    });
    expect(result.success).toBe(true);
  });

  it('should reject zero quantity', () => {
    const result = adjustStockSchema.safeParse({
      productId: 'clxxxxxxxxxxxxxxxxxxxxxxxx',
      movementType: 'ADJUSTMENT_IN',
      quantity: 0,
      reason: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('should require a reason', () => {
    const result = adjustStockSchema.safeParse({
      productId: 'clxxxxxxxxxxxxxxxxxxxxxxxx',
      movementType: 'ADJUSTMENT_OUT',
      quantity: 5,
      reason: '',
    });
    expect(result.success).toBe(false);
  });
});
