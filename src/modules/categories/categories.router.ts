import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize, ManagerRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createCategorySchema, updateCategorySchema } from './categories.schema';
import * as CategoriesService from './categories.service';
import { sendSuccess, sendCreated } from '../../utils/response';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const data = await CategoriesService.listCategories(includeInactive);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const data = await CategoriesService.getCategoryById(req.params.id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

router.post(
  '/',
  authorize(...ManagerRoles),
  validate(createCategorySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await CategoriesService.createCategory(req.body, req.user!.sub);
      sendCreated(res, data, 'Category created');
    } catch (err) { next(err); }
  },
);

router.patch(
  '/:id',
  authorize(...ManagerRoles),
  validate(updateCategorySchema),
  async (req, res, next) => {
    try {
      const data = await CategoriesService.updateCategory(req.params.id, req.body, req.user!.sub);
      sendSuccess(res, data, 'Category updated');
    } catch (err) { next(err); }
  },
);

router.delete(
  '/:id',
  authorize(...ManagerRoles),
  async (req, res, next) => {
    try {
      await CategoriesService.deleteCategory(req.params.id, req.user!.sub);
      sendSuccess(res, null, 'Category deleted');
    } catch (err) { next(err); }
  },
);

export { router as categoriesRouter };
