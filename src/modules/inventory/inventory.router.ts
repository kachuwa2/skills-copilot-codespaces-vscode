import { Router } from 'express';
import { authenticate, authorize, ManagerRoles, StaffRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { adjustStockSchema } from './inventory.schema';
import * as InventoryService from './inventory.service';
import { sendSuccess } from '../../utils/response';

const router = Router();
router.use(authenticate);

router.get('/overview', authorize(...StaffRoles), async (req, res, next) => {
  try {
    sendSuccess(res, await InventoryService.getInventoryOverview());
  } catch (err) { next(err); }
});

router.get('/movements', authorize(...StaffRoles), async (req, res, next) => {
  try {
    const result = await InventoryService.listStockMovements(req.query as Record<string, unknown>);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/product/:productId', authorize(...StaffRoles), async (req, res, next) => {
  try {
    sendSuccess(res, await InventoryService.getProductInventory(req.params.productId));
  } catch (err) { next(err); }
});

router.post('/adjust', authorize(...ManagerRoles), validate(adjustStockSchema), async (req, res, next) => {
  try {
    sendSuccess(res, await InventoryService.adjustStock(req.body, req.user!.sub), 'Stock adjusted');
  } catch (err) { next(err); }
});

export { router as inventoryRouter };
