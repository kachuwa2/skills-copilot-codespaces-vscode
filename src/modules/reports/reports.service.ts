import { prisma } from '../../config/database';
import { SaleStatus, PurchaseOrderStatus } from '@prisma/client';

// ─── Dashboard KPIs ───────────────────────────────────────────

export async function getDashboardStats() {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    todaySales,
    monthSales,
    totalProducts,
    lowStockCount,
    outOfStockCount,
    pendingPOs,
    totalCustomers,
    recentSales,
  ] = await Promise.all([
    // Today's sales total
    prisma.saleOrder.aggregate({
      where: { saleDate: { gte: startOfDay }, status: SaleStatus.COMPLETED },
      _sum: { totalAmount: true },
      _count: true,
    }),
    // This month's sales
    prisma.saleOrder.aggregate({
      where: { saleDate: { gte: startOfMonth }, status: SaleStatus.COMPLETED },
      _sum: { totalAmount: true },
      _count: true,
    }),
    // Inventory counts
    prisma.product.count({ where: { isActive: true } }),
    // Low stock: use raw SQL because cross-table comparison (qty <= reorder_level) isn't supported via Prisma ORM
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) AS count
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      WHERE p.is_active = true
        AND i.quantity_on_hand > 0
        AND i.quantity_on_hand <= p.reorder_level
    `.then((r) => Number(r[0]?.count ?? 0)) as unknown as number,
    prisma.inventory.count({ where: { quantityOnHand: 0 } }),
    // Pending purchase orders
    prisma.purchaseOrder.count({
      where: { status: { in: [PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED] } },
    }),
    prisma.customer.count({ where: { isActive: true } }),
    // Recent sales
    prisma.saleOrder.findMany({
      take: 5,
      orderBy: { saleDate: 'desc' },
      include: {
        customer: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  return {
    sales: {
      todayTotal: Number(todaySales._sum.totalAmount || 0),
      todayCount: todaySales._count,
      monthTotal: Number(monthSales._sum.totalAmount || 0),
      monthCount: monthSales._count,
    },
    inventory: {
      totalProducts,
      lowStockCount,
      outOfStockCount,
    },
    pendingPurchaseOrders: pendingPOs,
    totalCustomers,
    recentSales,
  };
}

// ─── Sales Reports ────────────────────────────────────────────

export async function getSalesReport(query: Record<string, unknown>) {
  const dateFrom = query.dateFrom ? new Date(String(query.dateFrom)) : new Date(0);
  const dateTo = query.dateTo ? new Date(String(query.dateTo)) : new Date();
  const groupBy = String(query.groupBy || 'day'); // day | month | product | customer

  const where = {
    status: SaleStatus.COMPLETED,
    saleDate: { gte: dateFrom, lte: dateTo },
  };

  if (groupBy === 'product') {
    // Sales by product
    const items = await prisma.saleOrderItem.groupBy({
      by: ['productId'],
      where: { saleOrder: where },
      _sum: { quantity: true, lineTotal: true },
      _count: true,
      orderBy: { _sum: { lineTotal: 'desc' } },
    });

    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true },
    });

    return items.map((item) => ({
      product: products.find((p) => p.id === item.productId),
      totalQtySold: item._sum.quantity || 0,
      totalRevenue: Number(item._sum.lineTotal || 0),
      orderCount: item._count,
    }));
  }

  if (groupBy === 'customer') {
    const sales = await prisma.saleOrder.groupBy({
      by: ['customerId'],
      where: { ...where, customerId: { not: null } },
      _sum: { totalAmount: true },
      _count: true,
      orderBy: { _sum: { totalAmount: 'desc' } },
    });

    const customerIds = sales.map((s) => s.customerId!).filter(Boolean);
    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true },
    });

    return sales.map((s) => ({
      customer: customers.find((c) => c.id === s.customerId),
      totalSales: Number(s._sum.totalAmount || 0),
      orderCount: s._count,
    }));
  }

  // Daily or monthly aggregation using raw query for performance.
  // Whitelist groupBy to prevent SQL injection — only two allowed format strings.
  const pgFormat = groupBy === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';

  // Use separate safe queries to avoid any string interpolation injection risk.
  let result: Array<{ period: string; total_amount: number; order_count: number }>;

  if (pgFormat === 'YYYY-MM') {
    result = await prisma.$queryRaw`
      SELECT 
        TO_CHAR(sale_date, 'YYYY-MM') AS period,
        SUM(total_amount) AS total_amount,
        COUNT(*) AS order_count
      FROM sale_orders
      WHERE status = 'COMPLETED'
        AND sale_date >= ${dateFrom}
        AND sale_date <= ${dateTo}
      GROUP BY period
      ORDER BY period ASC
    `;
  } else {
    result = await prisma.$queryRaw`
      SELECT 
        TO_CHAR(sale_date, 'YYYY-MM-DD') AS period,
        SUM(total_amount) AS total_amount,
        COUNT(*) AS order_count
      FROM sale_orders
      WHERE status = 'COMPLETED'
        AND sale_date >= ${dateFrom}
        AND sale_date <= ${dateTo}
      GROUP BY period
      ORDER BY period ASC
    `;
  }

  return result.map((r) => ({
    period: r.period,
    totalAmount: Number(r.total_amount),
    orderCount: Number(r.order_count),
  }));
}

// ─── Profit & Loss ────────────────────────────────────────────

export async function getProfitReport(query: Record<string, unknown>) {
  const dateFrom = query.dateFrom ? new Date(String(query.dateFrom)) : new Date(0);
  const dateTo = query.dateTo ? new Date(String(query.dateTo)) : new Date();

  const result = await prisma.$queryRaw<
    Array<{
      total_revenue: number;
      total_cost: number;
      total_discount: number;
      total_tax: number;
    }>
  >`
    SELECT 
      SUM(si.line_total) AS total_revenue,
      SUM(si.unit_cost * si.quantity) AS total_cost,
      SUM(si.discount) AS total_discount,
      SUM(so.tax_amount) AS total_tax
    FROM sale_order_items si
    JOIN sale_orders so ON so.id = si.sale_order_id
    WHERE so.status = 'COMPLETED'
      AND so.sale_date >= ${dateFrom}
      AND so.sale_date <= ${dateTo}
  `;

  const r = result[0];
  const revenue = Number(r?.total_revenue || 0);
  const cost = Number(r?.total_cost || 0);
  const grossProfit = revenue - cost;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  return {
    totalRevenue: revenue,
    totalCOGS: cost,
    grossProfit,
    grossMarginPct: Math.round(grossMarginPct * 100) / 100,
    totalDiscount: Number(r?.total_discount || 0),
    totalTax: Number(r?.total_tax || 0),
    dateRange: { from: dateFrom, to: dateTo },
  };
}

// ─── Inventory Value Report ────────────────────────────────────

export async function getInventoryValueReport() {
  const result = await prisma.$queryRaw<
    Array<{
      category_name: string;
      product_count: number;
      total_qty: number;
      total_cost_value: number;
      total_retail_value: number;
    }>
  >`
    SELECT
      c.name AS category_name,
      COUNT(p.id) AS product_count,
      SUM(i.quantity_on_hand) AS total_qty,
      SUM(i.quantity_on_hand * p.cost_price) AS total_cost_value,
      SUM(i.quantity_on_hand * p.retail_price) AS total_retail_value
    FROM products p
    JOIN inventory i ON i.product_id = p.id
    JOIN categories c ON c.id = p.category_id
    WHERE p.is_active = true
    GROUP BY c.name
    ORDER BY total_cost_value DESC
  `;

  const totals = result.reduce(
    (acc, row) => ({
      costValue: acc.costValue + Number(row.total_cost_value),
      retailValue: acc.retailValue + Number(row.total_retail_value),
      totalQty: acc.totalQty + Number(row.total_qty),
    }),
    { costValue: 0, retailValue: 0, totalQty: 0 },
  );

  return {
    byCategory: result.map((r) => ({
      category: r.category_name,
      productCount: Number(r.product_count),
      totalQty: Number(r.total_qty),
      costValue: Number(r.total_cost_value),
      retailValue: Number(r.total_retail_value),
    })),
    totals,
  };
}

// ─── Audit Logs ───────────────────────────────────────────────

export async function getAuditLogs(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10));
  const limit = Math.min(100, parseInt(String(query.limit || '50'), 10));
  const skip = (page - 1) * limit;
  const entityType = query.entityType as string | undefined;
  const userId = query.userId as string | undefined;

  const where = {
    ...(entityType ? { entityType } : {}),
    ...(userId ? { userId } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { data, total, page, limit };
}
