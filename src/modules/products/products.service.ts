import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { createAuditLog } from '../../middleware/auditLog';
import { AuditAction } from '@prisma/client';
import { getPaginationParams, paginationMeta } from '../../utils/response';
import { generateBarcodeValue, generateBarcodeBase64 } from '../barcodes/barcode.util';
import type { CreateProductInput, UpdateProductInput, UpdateCostPriceInput } from './products.schema';

const productSelect = {
  id: true,
  name: true,
  sku: true,
  barcode: true,
  description: true,
  unit: true,
  costPrice: true,
  retailPrice: true,
  wholesalePrice: true,
  wholesaleMinQty: true,
  reorderLevel: true,
  reorderQty: true,
  maxStockLevel: true,
  taxRate: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  inventory: { select: { quantityOnHand: true, quantityReserved: true, quantityOnOrder: true } },
};

export async function listProducts(query: Record<string, unknown>) {
  const { page, limit, skip } = getPaginationParams(query);
  const search = String(query.search || '');
  const categoryId = query.categoryId as string | undefined;
  const supplierId = query.supplierId as string | undefined;
  const lowStock = query.lowStock === 'true';

  const where: Record<string, unknown> = {
    isActive: true,
    ...(categoryId ? { categoryId } : {}),
    ...(supplierId ? { supplierId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  // Filter for low-stock items — fetched post-query since cross-table comparison
  // isn't directly supported without raw SQL in this Prisma version

  const [data, total] = await Promise.all([
    prisma.product.findMany({ where, skip, take: limit, orderBy: { name: 'asc' }, select: productSelect }),
    prisma.product.count({ where }),
  ]);

  return { data, meta: paginationMeta(total, page, limit) };
}

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      ...productSelect,
      costPriceHistory: { orderBy: { effectiveAt: 'desc' }, take: 10 },
      sellingPriceHistory: { orderBy: { effectiveAt: 'desc' }, take: 10 },
    },
  });
  if (!product) throw new AppError('Product not found', 404);
  return product;
}

export async function getProductByBarcode(barcode: string) {
  const product = await prisma.product.findUnique({
    where: { barcode },
    select: productSelect,
  });
  if (!product) throw new AppError('Product not found for this barcode', 404);
  return product;
}

export async function createProduct(input: CreateProductInput, userId: string) {
  // Verify category and supplier exist
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new AppError('Category not found', 404);

  if (input.supplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw new AppError('Supplier not found', 404);
  }

  // Auto-generate barcode if not provided
  const barcode = input.barcode || generateBarcodeValue(input.sku);

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name: input.name,
        sku: input.sku,
        barcode,
        description: input.description,
        categoryId: input.categoryId,
        supplierId: input.supplierId,
        unit: input.unit || 'piece',
        costPrice: input.costPrice,
        retailPrice: input.retailPrice,
        wholesalePrice: input.wholesalePrice,
        wholesaleMinQty: input.wholesaleMinQty || 1,
        reorderLevel: input.reorderLevel ?? 10,
        reorderQty: input.reorderQty ?? 50,
        maxStockLevel: input.maxStockLevel ?? 500,
        taxRate: input.taxRate ?? 0,
      },
    });

    // Create inventory record with 0 stock
    await tx.inventory.create({
      data: { productId: created.id },
    });

    // Seed initial cost price history
    await tx.costPriceHistory.create({
      data: {
        productId: created.id,
        oldCost: 0,
        newCost: input.costPrice,
        changedById: userId,
        reason: 'Initial cost price on product creation',
      },
    });

    return created;
  });

  await createAuditLog({
    userId,
    action: AuditAction.CREATE,
    entityType: 'Product',
    entityId: product.id,
    newValues: product,
    description: `Product created: ${product.name} (SKU: ${product.sku})`,
  });

  return getProductById(product.id);
}

export async function updateProduct(id: string, input: UpdateProductInput, userId: string) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new AppError('Product not found', 404);

  // If retail/wholesale prices changed, record price history
  const priceChanged =
    (input.retailPrice !== undefined && Number(input.retailPrice) !== Number(existing.retailPrice)) ||
    (input.wholesalePrice !== undefined && Number(input.wholesalePrice) !== Number(existing.wholesalePrice));

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.product.update({ where: { id }, data: input });

    if (priceChanged) {
      await tx.sellingPriceHistory.create({
        data: {
          productId: id,
          oldRetailPrice: existing.retailPrice,
          newRetailPrice: input.retailPrice ?? existing.retailPrice,
          oldWholesalePrice: existing.wholesalePrice,
          newWholesalePrice: input.wholesalePrice ?? existing.wholesalePrice,
          changedById: userId,
          reason: 'Price update',
        },
      });
    }

    return result;
  });

  await createAuditLog({
    userId,
    action: AuditAction.UPDATE,
    entityType: 'Product',
    entityId: id,
    oldValues: existing,
    newValues: updated,
    description: `Product updated: ${updated.name}`,
  });

  return getProductById(id);
}

export async function updateCostPrice(
  id: string,
  input: UpdateCostPriceInput,
  userId: string,
) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new AppError('Product not found', 404);

  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { costPrice: input.newCostPrice } });

    await tx.costPriceHistory.create({
      data: {
        productId: id,
        oldCost: existing.costPrice,
        newCost: input.newCostPrice,
        changedById: userId,
        reason: input.reason ?? 'Cost price update',
      },
    });
  });

  await createAuditLog({
    userId,
    action: AuditAction.PRICE_CHANGE,
    entityType: 'Product',
    entityId: id,
    oldValues: { costPrice: existing.costPrice },
    newValues: { costPrice: input.newCostPrice },
    description: `Cost price updated: ${existing.name}`,
  });

  return getProductById(id);
}

export async function getProductBarcode(id: string): Promise<string> {
  const product = await prisma.product.findUnique({
    where: { id },
    select: { barcode: true, sku: true },
  });
  if (!product) throw new AppError('Product not found', 404);

  const barcodeValue = product.barcode || product.sku;
  return generateBarcodeBase64(barcodeValue);
}

export async function getLowStockProducts() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      reorderLevel: true,
      reorderQty: true,
      inventory: { select: { quantityOnHand: true } },
      supplier: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  return products.filter(
    (p) => p.inventory && p.inventory.quantityOnHand <= p.reorderLevel,
  );
}
