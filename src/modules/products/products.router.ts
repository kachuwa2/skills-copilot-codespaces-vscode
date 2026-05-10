import { Router } from 'express';
import { authenticate, authorize, ManagerRoles, StaffRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createProductSchema, updateProductSchema, updateCostPriceSchema } from './products.schema';
import * as ProductsService from './products.service';
import { sendSuccess, sendCreated } from '../../utils/response';

const router = Router();
router.use(authenticate);

router.get('/', authorize(...StaffRoles), async (req, res, next) => {
  try {
    const result = await ProductsService.listProducts(req.query as Record<string, unknown>);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/low-stock', authorize(...StaffRoles), async (req, res, next) => {
  try {
    sendSuccess(res, await ProductsService.getLowStockProducts());
  } catch (err) { next(err); }
});

router.get('/barcode/:barcode', authorize(...StaffRoles), async (req, res, next) => {
  try {
    sendSuccess(res, await ProductsService.getProductByBarcode(req.params.barcode));
  } catch (err) { next(err); }
});

router.get('/:id', authorize(...StaffRoles), async (req, res, next) => {
  try {
    sendSuccess(res, await ProductsService.getProductById(req.params.id));
  } catch (err) { next(err); }
});

// GET barcode image (PNG)
router.get('/:id/barcode-image', authorize(...StaffRoles), async (req, res, next) => {
  try {
    const base64 = await ProductsService.getProductBarcode(req.params.id);
    // Return as JSON (base64 data URI) — client renders the image
    sendSuccess(res, { barcode: base64 });
  } catch (err) { next(err); }
});

router.post('/', authorize(...ManagerRoles), validate(createProductSchema), async (req, res, next) => {
  try {
    sendCreated(res, await ProductsService.createProduct(req.body, req.user!.sub), 'Product created');
  } catch (err) { next(err); }
});

router.patch('/:id', authorize(...ManagerRoles), validate(updateProductSchema), async (req, res, next) => {
  try {
    sendSuccess(res, await ProductsService.updateProduct(req.params.id, req.body, req.user!.sub), 'Product updated');
  } catch (err) { next(err); }
});

// Update cost price separately (restricted + always logged)
router.patch('/:id/cost-price', authorize(...ManagerRoles), validate(updateCostPriceSchema), async (req, res, next) => {
  try {
    sendSuccess(res, await ProductsService.updateCostPrice(req.params.id, req.body, req.user!.sub), 'Cost price updated');
  } catch (err) { next(err); }
});

export { router as productsRouter };
