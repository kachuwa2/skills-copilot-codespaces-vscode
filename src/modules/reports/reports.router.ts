import { Router } from 'express';
import { authenticate, authorize, AdminRoles, ManagerRoles, StaffRoles } from '../../middleware/auth';
import * as ReportsService from './reports.service';
import { sendSuccess } from '../../utils/response';

const router = Router();
router.use(authenticate);

router.get('/dashboard', authorize(...StaffRoles), async (req, res, next) => {
  try {
    sendSuccess(res, await ReportsService.getDashboardStats());
  } catch (err) { next(err); }
});

router.get('/sales', authorize(...ManagerRoles), async (req, res, next) => {
  try {
    sendSuccess(res, await ReportsService.getSalesReport(req.query as Record<string, unknown>));
  } catch (err) { next(err); }
});

router.get('/profit', authorize(...ManagerRoles), async (req, res, next) => {
  try {
    sendSuccess(res, await ReportsService.getProfitReport(req.query as Record<string, unknown>));
  } catch (err) { next(err); }
});

router.get('/inventory-value', authorize(...ManagerRoles), async (req, res, next) => {
  try {
    sendSuccess(res, await ReportsService.getInventoryValueReport());
  } catch (err) { next(err); }
});

router.get('/audit-logs', authorize(...AdminRoles), async (req, res, next) => {
  try {
    const result = await ReportsService.getAuditLogs(req.query as Record<string, unknown>);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

export { router as reportsRouter };
