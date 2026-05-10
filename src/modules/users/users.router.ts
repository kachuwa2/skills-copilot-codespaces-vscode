import { Router } from 'express';
import { authenticate, authorize, AdminRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { updateUserSchema } from './users.schema';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { createAuditLog } from '../../middleware/auditLog';
import { AuditAction, Role } from '@prisma/client';

const router = Router();
router.use(authenticate, authorize(...AdminRoles));

const userSelect = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
};

router.get('/', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
    sendSuccess(res, users);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: userSelect });
    if (!user) throw new AppError('User not found', 404);
    sendSuccess(res, user);
  } catch (err) { next(err); }
});

router.patch('/:id', validate(updateUserSchema), async (req, res, next) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('User not found', 404);

    // Only SUPER_ADMIN can change roles to SUPER_ADMIN/ADMIN
    if (req.body.role && ['SUPER_ADMIN', 'ADMIN'].includes(req.body.role)) {
      if (req.user!.role !== Role.SUPER_ADMIN) {
        throw new AppError('Only SUPER_ADMIN can assign admin roles', 403);
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: req.body,
      select: userSelect,
    });

    await createAuditLog({
      userId: req.user!.sub,
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: req.params.id,
      oldValues: { role: existing.role, isActive: existing.isActive },
      newValues: req.body,
      description: `User updated by admin: ${existing.email}`,
    });

    sendSuccess(res, updated, 'User updated');
  } catch (err) { next(err); }
});

export { router as usersRouter };
