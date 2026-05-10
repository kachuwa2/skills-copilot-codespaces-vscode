import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { createAuditLog } from '../../middleware/auditLog';
import { AuditAction } from '@prisma/client';
import { getPaginationParams, paginationMeta } from '../../utils/response';
import type { CreateSupplierInput, UpdateSupplierInput } from './suppliers.schema';

export async function listSuppliers(query: Record<string, unknown>) {
  const { page, limit, skip } = getPaginationParams(query);
  const search = String(query.search || '');
  const includeInactive = query.includeInactive === 'true';

  const where = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { contactName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true, purchaseOrders: true } } },
    }),
    prisma.supplier.count({ where }),
  ]);

  return { data, meta: paginationMeta(total, page, limit) };
}

export async function getSupplierById(id: string) {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true, purchaseOrders: true } },
    },
  });
  if (!supplier) throw new AppError('Supplier not found', 404);
  return supplier;
}

export async function createSupplier(input: CreateSupplierInput, userId: string) {
  const supplier = await prisma.supplier.create({ data: input });

  await createAuditLog({
    userId,
    action: AuditAction.CREATE,
    entityType: 'Supplier',
    entityId: supplier.id,
    newValues: supplier,
    description: `Supplier created: ${supplier.name}`,
  });

  return supplier;
}

export async function updateSupplier(id: string, input: UpdateSupplierInput, userId: string) {
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) throw new AppError('Supplier not found', 404);

  const updated = await prisma.supplier.update({ where: { id }, data: input });

  await createAuditLog({
    userId,
    action: AuditAction.UPDATE,
    entityType: 'Supplier',
    entityId: id,
    oldValues: existing,
    newValues: updated,
    description: `Supplier updated: ${updated.name}`,
  });

  return updated;
}

export async function deleteSupplier(id: string, userId: string) {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!supplier) throw new AppError('Supplier not found', 404);
  if (supplier._count.products > 0)
    throw new AppError('Cannot delete a supplier that has products', 400);

  await prisma.supplier.update({ where: { id }, data: { isActive: false } });

  await createAuditLog({
    userId,
    action: AuditAction.DELETE,
    entityType: 'Supplier',
    entityId: id,
    description: `Supplier deleted: ${supplier.name}`,
  });
}
