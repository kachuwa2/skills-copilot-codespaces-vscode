import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { createAuditLog } from '../../middleware/auditLog';
import { AuditAction } from '@prisma/client';
import { getPaginationParams, paginationMeta } from '../../utils/response';
import type { CreateCustomerInput, UpdateCustomerInput } from './customers.schema';

export async function listCustomers(query: Record<string, unknown>) {
  const { page, limit, skip } = getPaginationParams(query);
  const search = String(query.search || '');
  const customerType = query.customerType as string | undefined;

  const where = {
    isActive: true,
    ...(customerType ? { customerType: customerType as 'RETAIL' | 'WHOLESALE' } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: { _count: { select: { saleOrders: true } } },
    }),
    prisma.customer.count({ where }),
  ]);

  return { data, meta: paginationMeta(total, page, limit) };
}

export async function getCustomerById(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      _count: { select: { saleOrders: true } },
    },
  });
  if (!customer) throw new AppError('Customer not found', 404);
  return customer;
}

export async function getCustomerStatement(id: string) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw new AppError('Customer not found', 404);

  const sales = await prisma.saleOrder.findMany({
    where: { customerId: id },
    include: { items: { include: { product: { select: { name: true, sku: true } } } }, payments: true },
    orderBy: { saleDate: 'desc' },
    take: 50,
  });

  return { customer, sales };
}

export async function createCustomer(input: CreateCustomerInput, userId: string) {
  const customer = await prisma.customer.create({ data: input });

  await createAuditLog({
    userId,
    action: AuditAction.CREATE,
    entityType: 'Customer',
    entityId: customer.id,
    newValues: customer,
    description: `Customer created: ${customer.name}`,
  });

  return customer;
}

export async function updateCustomer(id: string, input: UpdateCustomerInput, userId: string) {
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) throw new AppError('Customer not found', 404);

  const updated = await prisma.customer.update({ where: { id }, data: input });

  await createAuditLog({
    userId,
    action: AuditAction.UPDATE,
    entityType: 'Customer',
    entityId: id,
    oldValues: existing,
    newValues: updated,
    description: `Customer updated: ${updated.name}`,
  });

  return updated;
}

export async function deleteCustomer(id: string, userId: string) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw new AppError('Customer not found', 404);

  await prisma.customer.update({ where: { id }, data: { isActive: false } });

  await createAuditLog({
    userId,
    action: AuditAction.DELETE,
    entityType: 'Customer',
    entityId: id,
    description: `Customer deleted: ${customer.name}`,
  });
}
