import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { createAuditLog } from '../../middleware/auditLog';
import { AuditAction, PurchaseOrderStatus, PaymentStatus, StockMovementType } from '@prisma/client';
import { recordStockMovement } from '../inventory/inventory.service';
import { getPaginationParams, paginationMeta } from '../../utils/response';
import type { CreatePurchaseOrderInput, ReceivePurchaseInput, AddPurchasePaymentInput } from './purchases.schema';

function generateOrderNumber(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `${prefix}-${ts}`;
}

function computePaymentStatus(total: number, paid: number): PaymentStatus {
  if (paid <= 0) return PaymentStatus.UNPAID;
  if (paid >= total) return paid > total ? PaymentStatus.OVERPAID : PaymentStatus.PAID;
  return PaymentStatus.PARTIAL;
}

const poInclude = {
  supplier: { select: { id: true, name: true, email: true } },
  items: {
    include: { product: { select: { id: true, name: true, sku: true, barcode: true } } },
  },
  payments: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

export async function listPurchaseOrders(query: Record<string, unknown>) {
  const { page, limit, skip } = getPaginationParams(query);
  const status = query.status as PurchaseOrderStatus | undefined;
  const supplierId = query.supplierId as string | undefined;

  const where = {
    ...(status ? { status } : {}),
    ...(supplierId ? { supplierId } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return { data, meta: paginationMeta(total, page, limit) };
}

export async function getPurchaseOrderById(id: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: poInclude });
  if (!po) throw new AppError('Purchase order not found', 404);
  return po;
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput, userId: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new AppError('Supplier not found', 404);

  // Validate all products exist
  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  if (products.length !== productIds.length) {
    throw new AppError('One or more products not found', 404);
  }

  const orderNumber = generateOrderNumber('PO');

  // Calculate totals
  let subtotal = 0;
  let taxAmount = 0;

  const itemsData = input.items.map((item) => {
    const lineSubtotal = item.orderedQty * item.unitCost;
    const lineTax = lineSubtotal * (item.taxRate / 100);
    subtotal += lineSubtotal;
    taxAmount += lineTax;

    return {
      productId: item.productId,
      orderedQty: item.orderedQty,
      receivedQty: 0,
      unitCost: item.unitCost,
      taxRate: item.taxRate,
      lineTotal: lineSubtotal + lineTax,
    };
  });

  const totalAmount = subtotal + taxAmount;

  const po = await prisma.purchaseOrder.create({
    data: {
      orderNumber,
      supplierId: input.supplierId,
      expectedDate: input.expectedDate ? new Date(input.expectedDate) : undefined,
      notes: input.notes,
      subtotal,
      taxAmount,
      totalAmount,
      createdById: userId,
      items: { create: itemsData },
    },
    include: poInclude,
  });

  // Update quantityOnOrder for each product
  await prisma.$transaction(
    input.items.map((item) =>
      prisma.inventory.update({
        where: { productId: item.productId },
        data: { quantityOnOrder: { increment: item.orderedQty } },
      }),
    ),
  );

  await createAuditLog({
    userId,
    action: AuditAction.CREATE,
    entityType: 'PurchaseOrder',
    entityId: po.id,
    description: `Purchase order created: ${orderNumber}`,
  });

  return po;
}

/**
 * Receive goods from supplier — updates inventory stock.
 * Supports partial receiving (multiple receive calls).
 */
export async function receivePurchaseOrder(
  id: string,
  input: ReceivePurchaseInput,
  userId: string,
) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!po) throw new AppError('Purchase order not found', 404);
  if (po.status === PurchaseOrderStatus.CANCELLED)
    throw new AppError('Cannot receive a cancelled purchase order', 400);
  if (po.status === PurchaseOrderStatus.RECEIVED)
    throw new AppError('This purchase order is already fully received', 400);

  // Validate received quantities
  for (const recv of input.items) {
    const poItem = po.items.find((i) => i.productId === recv.productId);
    if (!poItem) throw new AppError(`Product ${recv.productId} not in this purchase order`, 400);

    const remaining = poItem.orderedQty - poItem.receivedQty;
    if (recv.receivedQty > remaining) {
      throw new AppError(
        `Cannot receive more than ordered for product ${recv.productId}. Remaining: ${remaining}`,
        400,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const recv of input.items) {
      if (recv.receivedQty === 0) continue;

      const poItem = po.items.find((i) => i.productId === recv.productId)!;

      // Update received quantity on the PO item
      await tx.purchaseOrderItem.update({
        where: { id: poItem.id },
        data: { receivedQty: { increment: recv.receivedQty } },
      });

      // Record stock movement (increases inventory)
      await recordStockMovement(tx, {
        productId: recv.productId,
        movementType: StockMovementType.PURCHASE,
        quantity: recv.receivedQty,
        unitCost: Number(poItem.unitCost),
        referenceType: 'PurchaseOrder',
        referenceId: po.id,
        notes: input.notes,
        createdById: userId,
      });

      // Reduce quantityOnOrder
      await tx.inventory.update({
        where: { productId: recv.productId },
        data: { quantityOnOrder: { decrement: recv.receivedQty } },
      });

      // Update product cost price if it changed
      const product = await tx.product.findUnique({ where: { id: recv.productId } });
      if (product && Number(poItem.unitCost) !== Number(product.costPrice)) {
        await tx.costPriceHistory.create({
          data: {
            productId: recv.productId,
            oldCost: product.costPrice,
            newCost: poItem.unitCost,
            changedById: userId,
            reason: `Cost updated from purchase order ${po.orderNumber}`,
          },
        });
        await tx.product.update({
          where: { id: recv.productId },
          data: { costPrice: poItem.unitCost },
        });
      }
    }

    // Re-fetch updated items to determine new status
    const updatedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
    const allReceived = updatedItems.every((i) => i.receivedQty >= i.orderedQty);
    const anyReceived = updatedItems.some((i) => i.receivedQty > 0);

    const newStatus = allReceived
      ? PurchaseOrderStatus.RECEIVED
      : anyReceived
      ? PurchaseOrderStatus.PARTIALLY_RECEIVED
      : po.status;

    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: newStatus,
        receivedDate: allReceived ? new Date() : undefined,
      },
    });
  });

  await createAuditLog({
    userId,
    action: AuditAction.UPDATE,
    entityType: 'PurchaseOrder',
    entityId: id,
    newValues: input,
    description: `Goods received for PO: ${po.orderNumber}`,
  });

  return getPurchaseOrderById(id);
}

export async function addPurchasePayment(
  id: string,
  input: AddPurchasePaymentInput,
  userId: string,
) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) throw new AppError('Purchase order not found', 404);

  const newPaid = Number(po.paidAmount) + input.amount;
  if (newPaid > Number(po.totalAmount)) {
    throw new AppError('Payment exceeds order total', 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchasePayment.create({
      data: {
        purchaseOrderId: id,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber,
        notes: input.notes,
      },
    });

    await tx.purchaseOrder.update({
      where: { id },
      data: {
        paidAmount: newPaid,
        paymentStatus: computePaymentStatus(Number(po.totalAmount), newPaid),
      },
    });
  });

  return getPurchaseOrderById(id);
}

export async function cancelPurchaseOrder(id: string, userId: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
  if (!po) throw new AppError('Purchase order not found', 404);
  if (po.status !== PurchaseOrderStatus.DRAFT && po.status !== PurchaseOrderStatus.SENT) {
    throw new AppError('Only DRAFT or SENT orders can be cancelled', 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CANCELLED },
    });

    // Restore quantityOnOrder
    for (const item of po.items) {
      await tx.inventory.update({
        where: { productId: item.productId },
        data: { quantityOnOrder: { decrement: item.orderedQty - item.receivedQty } },
      });
    }
  });

  await createAuditLog({
    userId,
    action: AuditAction.DELETE,
    entityType: 'PurchaseOrder',
    entityId: id,
    description: `Purchase order cancelled: ${po.orderNumber}`,
  });
}
