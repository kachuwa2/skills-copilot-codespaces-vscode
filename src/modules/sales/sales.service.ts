import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { createAuditLog } from '../../middleware/auditLog';
import {
  AuditAction,
  CustomerType,
  SaleStatus,
  PaymentStatus,
  StockMovementType,
} from '@prisma/client';
import { recordStockMovement } from '../inventory/inventory.service';
import { getPaginationParams, paginationMeta } from '../../utils/response';
import type { CreateSaleOrderInput, AddSalePaymentInput, CreateSaleReturnInput } from './sales.schema';

function generateOrderNumber(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `${prefix}-${ts}`;
}

function computePaymentStatus(total: number, paid: number): PaymentStatus {
  if (paid <= 0) return PaymentStatus.UNPAID;
  if (paid >= total) return paid > total ? PaymentStatus.OVERPAID : PaymentStatus.PAID;
  return PaymentStatus.PARTIAL;
}

const saleInclude = {
  customer: { select: { id: true, name: true, email: true, customerType: true } },
  items: {
    include: { product: { select: { id: true, name: true, sku: true, barcode: true, unit: true } } },
  },
  payments: true,
  returns: { include: { items: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

// ─── List / Get ───────────────────────────────────────────────

export async function listSaleOrders(query: Record<string, unknown>) {
  const { page, limit, skip } = getPaginationParams(query);
  const status = query.status as SaleStatus | undefined;
  const customerId = query.customerId as string | undefined;
  const dateFrom = query.dateFrom as string | undefined;
  const dateTo = query.dateTo as string | undefined;

  const where = {
    ...(status ? { status } : {}),
    ...(customerId ? { customerId } : {}),
    ...(dateFrom || dateTo
      ? {
          saleDate: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.saleOrder.findMany({
      where,
      skip,
      take: limit,
      orderBy: { saleDate: 'desc' },
      include: {
        customer: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.saleOrder.count({ where }),
  ]);

  return { data, meta: paginationMeta(total, page, limit) };
}

export async function getSaleOrderById(id: string) {
  const sale = await prisma.saleOrder.findUnique({ where: { id }, include: saleInclude });
  if (!sale) throw new AppError('Sale order not found', 404);
  return sale;
}

// ─── Create Sale ──────────────────────────────────────────────

/**
 * Creates a sale order and immediately deducts stock.
 *
 * Pricing logic:
 * - If customer is WHOLESALE and qty >= wholesaleMinQty → wholesalePrice
 * - Otherwise → retailPrice
 * - Per-item discount applied after price selection
 * - Order-level discount applied to subtotal
 */
export async function createSaleOrder(input: CreateSaleOrderInput, userId: string) {
  // Load customer if provided
  let customer = null;
  if (input.customerId) {
    customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new AppError('Customer not found', 404);
  }

  const customerType = (customer?.customerType || input.customerType) as CustomerType;

  // Load all products in one query
  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    include: { inventory: true },
  });

  if (products.length !== productIds.length) {
    throw new AppError('One or more products not found or inactive', 404);
  }

  // Check stock and compute line items
  let subtotal = 0;
  let taxTotal = 0;

  const itemsData = input.items.map((item) => {
    const product = products.find((p) => p.id === item.productId)!;
    const inventory = product.inventory!;

    if (inventory.quantityOnHand < item.quantity) {
      throw new AppError(
        `Insufficient stock for "${product.name}". Available: ${inventory.quantityOnHand}`,
        400,
      );
    }

    // Determine unit price: wholesale if applicable
    const isWholesale =
      customerType === CustomerType.WHOLESALE && item.quantity >= product.wholesaleMinQty;
    const unitPrice = isWholesale ? Number(product.wholesalePrice) : Number(product.retailPrice);

    const lineBeforeDiscount = unitPrice * item.quantity;
    const lineDiscount = Math.min(item.discount, lineBeforeDiscount);
    const lineAfterDiscount = lineBeforeDiscount - lineDiscount;
    const lineTax = lineAfterDiscount * (Number(product.taxRate) / 100);
    const lineTotal = lineAfterDiscount + lineTax;

    subtotal += lineAfterDiscount;
    taxTotal += lineTax;

    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice,
      unitCost: Number(product.costPrice),
      taxRate: Number(product.taxRate),
      discount: lineDiscount,
      lineTotal,
      // pass-through for stock recording
      _inventory: inventory,
    };
  });

  const orderDiscount = Math.min(input.discountAmount || 0, subtotal);
  const totalAmount = subtotal + taxTotal - orderDiscount;
  const orderNumber = generateOrderNumber('SO');

  const sale = await prisma.$transaction(async (tx) => {
    const order = await tx.saleOrder.create({
      data: {
        orderNumber,
        customerId: input.customerId,
        customerType,
        status: SaleStatus.COMPLETED,
        notes: input.notes,
        subtotal,
        taxAmount: taxTotal,
        discountAmount: orderDiscount,
        totalAmount,
        createdById: userId,
        items: {
          create: itemsData.map(({ _inventory: _, ...rest }) => rest),
        },
      },
      include: saleInclude,
    });

    // Deduct stock for each item
    for (const item of itemsData) {
      await recordStockMovement(tx, {
        productId: item.productId,
        movementType: StockMovementType.SALE,
        quantity: -item.quantity, // negative = stock out
        unitCost: item.unitCost,
        referenceType: 'SaleOrder',
        referenceId: order.id,
        createdById: userId,
      });
    }

    // Update customer outstanding debt if credit sale
    if (input.customerId) {
      await tx.customer.update({
        where: { id: input.customerId },
        data: { outstandingDebt: { increment: totalAmount } },
      });
    }

    return order;
  });

  await createAuditLog({
    userId,
    action: AuditAction.CREATE,
    entityType: 'SaleOrder',
    entityId: sale.id,
    description: `Sale order created: ${orderNumber}, Total: ${totalAmount}`,
  });

  return sale;
}

// ─── Payments ─────────────────────────────────────────────────

export async function addSalePayment(id: string, input: AddSalePaymentInput, userId: string) {
  const sale = await prisma.saleOrder.findUnique({ where: { id } });
  if (!sale) throw new AppError('Sale order not found', 404);
  if (sale.status === SaleStatus.CANCELLED) throw new AppError('Cannot pay a cancelled sale', 400);

  const newPaid = Number(sale.paidAmount) + input.amount;
  const change = Math.max(0, newPaid - Number(sale.totalAmount));

  await prisma.$transaction(async (tx) => {
    await tx.salePayment.create({
      data: {
        saleOrderId: id,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber,
        notes: input.notes,
      },
    });

    await tx.saleOrder.update({
      where: { id },
      data: {
        paidAmount: newPaid,
        changeAmount: change,
        paymentStatus: computePaymentStatus(Number(sale.totalAmount), newPaid),
      },
    });

    // Reduce customer outstanding debt
    if (sale.customerId) {
      await tx.customer.update({
        where: { id: sale.customerId },
        data: { outstandingDebt: { decrement: input.amount } },
      });
    }
  });

  return getSaleOrderById(id);
}

// ─── Returns ──────────────────────────────────────────────────

export async function createSaleReturn(
  saleId: string,
  input: CreateSaleReturnInput,
  userId: string,
) {
  const sale = await prisma.saleOrder.findUnique({
    where: { id: saleId },
    include: { items: true },
  });

  if (!sale) throw new AppError('Sale order not found', 404);
  if (sale.status === SaleStatus.CANCELLED) {
    throw new AppError('Cannot return a cancelled sale', 400);
  }

  // Validate return quantities
  for (const retItem of input.items) {
    const saleItem = sale.items.find((i) => i.productId === retItem.productId);
    if (!saleItem) throw new AppError(`Product ${retItem.productId} not in this sale`, 400);
    if (retItem.quantity > saleItem.quantity) {
      throw new AppError(`Return quantity exceeds sold quantity for product ${retItem.productId}`, 400);
    }
  }

  let refundAmount = 0;

  await prisma.$transaction(async (tx) => {
    const saleReturn = await tx.saleReturn.create({
      data: {
        saleOrderId: saleId,
        reason: input.reason,
        notes: input.notes,
        refundAmount: 0, // calculated below
        items: {
          create: input.items.map((i) => {
            const saleItem = sale.items.find((s) => s.productId === i.productId)!;
            const itemRefund = Number(saleItem.unitPrice) * i.quantity;
            refundAmount += itemRefund;
            return {
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: saleItem.unitPrice,
              restocked: i.restocked,
            };
          }),
        },
      },
    });

    // Update refund amount
    await tx.saleReturn.update({
      where: { id: saleReturn.id },
      data: { refundAmount },
    });

    // Re-stock returned items if restocked=true
    for (const retItem of input.items) {
      if (retItem.restocked) {
        await recordStockMovement(tx, {
          productId: retItem.productId,
          movementType: StockMovementType.RETURN_FROM_CUSTOMER,
          quantity: retItem.quantity, // positive = back in stock
          referenceType: 'SaleReturn',
          referenceId: saleReturn.id,
          notes: input.reason,
          createdById: userId,
        });
      }
    }

    // Update sale status
    await tx.saleOrder.update({
      where: { id: saleId },
      data: { status: SaleStatus.PARTIALLY_RETURNED },
    });

    // Reduce customer debt if applicable
    if (sale.customerId) {
      await tx.customer.update({
        where: { id: sale.customerId },
        data: { outstandingDebt: { decrement: refundAmount } },
      });
    }
  });

  await createAuditLog({
    userId,
    action: AuditAction.UPDATE,
    entityType: 'SaleOrder',
    entityId: saleId,
    description: `Sale return processed. Refund: ${refundAmount}`,
  });

  return getSaleOrderById(saleId);
}
