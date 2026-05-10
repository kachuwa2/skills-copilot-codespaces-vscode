import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { createAuditLog } from '../../middleware/auditLog';
import { AuditAction, StockMovementType } from '@prisma/client';
import { getPaginationParams, paginationMeta } from '../../utils/response';
import type { AdjustStockInput } from './inventory.schema';

/**
 * Core function: adjust stock quantity and record the movement.
 * This is the SINGLE source of truth for all stock changes.
 * Always called within a transaction from purchase/sales/adjustment flows.
 */
export async function recordStockMovement(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  params: {
    productId: string;
    movementType: StockMovementType;
    quantity: number;  // positive = in, negative = out
    unitCost?: number;
    referenceType?: string;
    referenceId?: string;
    notes?: string;
    createdById: string;
  },
): Promise<void> {
  const inventory = await tx.inventory.findUnique({
    where: { productId: params.productId },
  });

  if (!inventory) throw new AppError(`No inventory record for product ${params.productId}`, 500);

  const newQty = inventory.quantityOnHand + params.quantity;
  if (newQty < 0) {
    throw new AppError(`Insufficient stock. Available: ${inventory.quantityOnHand}`, 400);
  }

  // Update inventory
  await tx.inventory.update({
    where: { productId: params.productId },
    data: { quantityOnHand: newQty },
  });

  // Record immutable movement log
  await tx.stockMovement.create({
    data: {
      productId: params.productId,
      movementType: params.movementType,
      quantity: params.quantity,
      unitCost: params.unitCost,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      notes: params.notes,
      qtyBefore: inventory.quantityOnHand,
      qtyAfter: newQty,
      createdById: params.createdById,
    },
  });
}

// ─── Queries ──────────────────────────────────────────────────

export async function getInventoryOverview() {
  const [totalProducts, outOfStockCount] = await Promise.all([
    prisma.inventory.count(),
    prisma.inventory.count({ where: { quantityOnHand: 0 } }),
  ]);

  // Low stock: qty > 0 but <= reorder level (requires cross-table join — use raw query)
  const lowStockResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) AS count
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    WHERE p.is_active = true
      AND i.quantity_on_hand > 0
      AND i.quantity_on_hand <= p.reorder_level
  `;
  const lowStockCount = Number(lowStockResult[0]?.count ?? 0);

  const totalValue = await prisma.$queryRaw<[{ total: number }]>`
    SELECT SUM(i.quantity_on_hand * p.cost_price) AS total
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    WHERE p.is_active = true
  `;

  return {
    totalProducts,
    lowStockCount,
    outOfStockCount,
    totalInventoryValue: Number(totalValue[0]?.total || 0),
  };
}

export async function listStockMovements(query: Record<string, unknown>) {
  const { page, limit, skip } = getPaginationParams(query);
  const productId = query.productId as string | undefined;
  const movementType = query.movementType as StockMovementType | undefined;

  const where = {
    ...(productId ? { productId } : {}),
    ...(movementType ? { movementType } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return { data, meta: paginationMeta(total, page, limit) };
}

export async function getProductInventory(productId: string) {
  const inventory = await prisma.inventory.findUnique({
    where: { productId },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          reorderLevel: true,
          reorderQty: true,
          costPrice: true,
          retailPrice: true,
          wholesalePrice: true,
        },
      },
    },
  });

  if (!inventory) throw new AppError('Inventory not found for this product', 404);
  return inventory;
}

// ─── Manual Adjustment ────────────────────────────────────────

export async function adjustStock(input: AdjustStockInput, userId: string) {
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new AppError('Product not found', 404);

  const delta =
    input.movementType === 'ADJUSTMENT_OUT'
      ? -input.quantity
      : input.quantity;

  await prisma.$transaction(async (tx) => {
    // Record in stock_adjustments table (approval trail)
    await tx.stockAdjustment.create({
      data: {
        productId: input.productId,
        adjustedById: userId,
        movementType: input.movementType as StockMovementType,
        quantity: delta,
        reason: input.reason,
        notes: input.notes,
      },
    });

    await recordStockMovement(tx, {
      productId: input.productId,
      movementType: input.movementType as StockMovementType,
      quantity: delta,
      notes: `${input.reason}${input.notes ? `: ${input.notes}` : ''}`,
      createdById: userId,
    });
  });

  await createAuditLog({
    userId,
    action: AuditAction.STOCK_ADJUSTMENT,
    entityType: 'Inventory',
    entityId: input.productId,
    newValues: input,
    description: `Stock adjusted for ${product.name}: ${delta > 0 ? '+' : ''}${delta} (${input.movementType})`,
  });

  return getProductInventory(input.productId);
}
