import { Router } from 'express';
import { authenticate, authorize, ManagerRoles, StaffRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createPurchaseOrderSchema,
  receivePurchaseSchema,
  addPurchasePaymentSchema,
} from './purchases.schema';
import * as PurchasesService from './purchases.service';
import { sendSuccess, sendCreated } from '../../utils/response';

const router = Router();
router.use(authenticate);

router.get('/', authorize(...StaffRoles), async (req, res, next) => {
  try {
    const result = await PurchasesService.listPurchaseOrders(req.query as Record<string, unknown>);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/:id', authorize(...StaffRoles), async (req, res, next) => {
  try {
    sendSuccess(res, await PurchasesService.getPurchaseOrderById(req.params.id));
  } catch (err) { next(err); }
});

router.post('/', authorize(...ManagerRoles), validate(createPurchaseOrderSchema), async (req, res, next) => {
  try {
    sendCreated(res, await PurchasesService.createPurchaseOrder(req.body, req.user!.sub), 'Purchase order created');
  } catch (err) { next(err); }
});

router.post('/:id/receive', authorize(...ManagerRoles), validate(receivePurchaseSchema), async (req, res, next) => {
  try {
    sendSuccess(res, await PurchasesService.receivePurchaseOrder(req.params.id, req.body, req.user!.sub), 'Goods received');
  } catch (err) { next(err); }
});

router.post('/:id/payments', authorize(...ManagerRoles), validate(addPurchasePaymentSchema), async (req, res, next) => {
  try {
    sendSuccess(res, await PurchasesService.addPurchasePayment(req.params.id, req.body, req.user!.sub), 'Payment recorded');
  } catch (err) { next(err); }
});

router.post('/:id/cancel', authorize(...ManagerRoles), async (req, res, next) => {
  try {
    await PurchasesService.cancelPurchaseOrder(req.params.id, req.user!.sub);
    sendSuccess(res, null, 'Purchase order cancelled');
  } catch (err) { next(err); }
});

export { router as purchasesRouter };
