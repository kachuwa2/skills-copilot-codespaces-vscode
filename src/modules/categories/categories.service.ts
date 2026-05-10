import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { createAuditLog } from '../../middleware/auditLog';
import { AuditAction } from '@prisma/client';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.schema';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function listCategories(includeInactive = false) {
  return prisma.category.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: { children: { where: { isActive: true } }, _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function getCategoryById(id: string) {
  const cat = await prisma.category.findUnique({
    where: { id },
    include: {
      parent: true,
      children: true,
      _count: { select: { products: true } },
    },
  });
  if (!cat) throw new AppError('Category not found', 404);
  return cat;
}

export async function createCategory(input: CreateCategoryInput, userId: string) {
  const slug = toSlug(input.name);

  if (input.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: input.parentId } });
    if (!parent) throw new AppError('Parent category not found', 404);
  }

  const category = await prisma.category.create({
    data: { name: input.name, slug, description: input.description, parentId: input.parentId },
  });

  await createAuditLog({
    userId,
    action: AuditAction.CREATE,
    entityType: 'Category',
    entityId: category.id,
    newValues: category,
    description: `Category created: ${category.name}`,
  });

  return category;
}

export async function updateCategory(id: string, input: UpdateCategoryInput, userId: string) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw new AppError('Category not found', 404);

  const data: Record<string, unknown> = { ...input };
  if (input.name) data.slug = toSlug(input.name);

  const updated = await prisma.category.update({ where: { id }, data });

  await createAuditLog({
    userId,
    action: AuditAction.UPDATE,
    entityType: 'Category',
    entityId: id,
    oldValues: existing,
    newValues: updated,
    description: `Category updated: ${updated.name}`,
  });

  return updated;
}

export async function deleteCategory(id: string, userId: string) {
  const cat = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true, children: true } } },
  });
  if (!cat) throw new AppError('Category not found', 404);
  if (cat._count.products > 0)
    throw new AppError('Cannot delete a category that has products', 400);
  if (cat._count.children > 0)
    throw new AppError('Cannot delete a category that has sub-categories', 400);

  // Soft-delete
  await prisma.category.update({ where: { id }, data: { isActive: false } });

  await createAuditLog({
    userId,
    action: AuditAction.DELETE,
    entityType: 'Category',
    entityId: id,
    description: `Category deleted: ${cat.name}`,
  });
}
