import { Router } from 'express';
import { authenticate, authorize, ManagerRoles, StaffRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createCustomerSchema, updateCustomerSchema } from './customers.schema';
import * as CustomersService from './customers.service';
import { sendSuccess, sendCreated } from '../../utils/response';

const router = Router();
router.use(authenticate);

router.get('/', authorize(...StaffRoles), async (req, res, next) => {
  try {
    const result = await CustomersService.listCustomers(req.query as Record<string, unknown>);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get('/:id', authorize(...StaffRoles), async (req, res, next) => {
  try {
    sendSuccess(res, await CustomersService.getCustomerById(req.params.id));
  } catch (err) { next(err); }
});

router.get('/:id/statement', authorize(...StaffRoles), async (req, res, next) => {
  try {
    sendSuccess(res, await CustomersService.getCustomerStatement(req.params.id));
  } catch (err) { next(err); }
});

router.post('/', authorize(...StaffRoles), validate(createCustomerSchema), async (req, res, next) => {
  try {
    sendCreated(res, await CustomersService.createCustomer(req.body, req.user!.sub), 'Customer created');
  } catch (err) { next(err); }
});

router.patch('/:id', authorize(...StaffRoles), validate(updateCustomerSchema), async (req, res, next) => {
  try {
    sendSuccess(res, await CustomersService.updateCustomer(req.params.id, req.body, req.user!.sub), 'Customer updated');
  } catch (err) { next(err); }
});

router.delete('/:id', authorize(...ManagerRoles), async (req, res, next) => {
  try {
    await CustomersService.deleteCustomer(req.params.id, req.user!.sub);
    sendSuccess(res, null, 'Customer deleted');
  } catch (err) { next(err); }
});

export { router as customersRouter };
