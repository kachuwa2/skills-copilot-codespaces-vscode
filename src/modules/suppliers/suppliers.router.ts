import { Router } from 'express';
import { authenticate, authorize, ManagerRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createSupplierSchema, updateSupplierSchema } from './suppliers.schema';
import * as SuppliersService from './suppliers.service';
import { sendSuccess, sendCreated } from '../../utils/response';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const result = await SuppliersService.listSuppliers(req.query as Record<string, unknown>);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    sendSuccess(res, await SuppliersService.getSupplierById(req.params.id));
  } catch (err) { next(err); }
});

router.post('/', authorize(...ManagerRoles), validate(createSupplierSchema), async (req, res, next) => {
  try {
    sendCreated(res, await SuppliersService.createSupplier(req.body, req.user!.sub), 'Supplier created');
  } catch (err) { next(err); }
});

router.patch('/:id', authorize(...ManagerRoles), validate(updateSupplierSchema), async (req, res, next) => {
  try {
    sendSuccess(res, await SuppliersService.updateSupplier(req.params.id, req.body, req.user!.sub), 'Supplier updated');
  } catch (err) { next(err); }
});

router.delete('/:id', authorize(...ManagerRoles), async (req, res, next) => {
  try {
    await SuppliersService.deleteSupplier(req.params.id, req.user!.sub);
    sendSuccess(res, null, 'Supplier deleted');
  } catch (err) { next(err); }
});

export { router as suppliersRouter };
