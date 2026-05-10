import { Router } from 'express';
import { authenticate, authorize, ManagerRoles, StaffRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createSaleOrderSchema,
  addSalePaymentSchema,
  createSaleReturnSchema,
} from './sales.schema';
import * as SalesService from './sales.service';
import { sendSuccess, sendCreated } from '../../utils/response';

const router = Router();
router.use(authenticate);

router.get('/', authorize(...StaffRoles), async (req, res, next) => {
  try {
    const result = await SalesService.listSaleOrders(req.query as Record<string, unknown>);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/:id', authorize(...StaffRoles), async (req, res, next) => {
  try {
    sendSuccess(res, await SalesService.getSaleOrderById(req.params.id));
  } catch (err) { next(err); }
});

router.post('/', authorize(...StaffRoles), validate(createSaleOrderSchema), async (req, res, next) => {
  try {
    sendCreated(res, await SalesService.createSaleOrder(req.body, req.user!.sub), 'Sale created');
  } catch (err) { next(err); }
});

router.post('/:id/payments', authorize(...StaffRoles), validate(addSalePaymentSchema), async (req, res, next) => {
  try {
    sendSuccess(res, await SalesService.addSalePayment(req.params.id, req.body, req.user!.sub), 'Payment recorded');
  } catch (err) { next(err); }
});

router.post('/:id/returns', authorize(...ManagerRoles), validate(createSaleReturnSchema), async (req, res, next) => {
  try {
    sendSuccess(res, await SalesService.createSaleReturn(req.params.id, req.body, req.user!.sub), 'Return processed');
  } catch (err) { next(err); }
});

export { router as salesRouter };
