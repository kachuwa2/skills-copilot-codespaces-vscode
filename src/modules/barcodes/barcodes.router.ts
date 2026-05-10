import { Router } from 'express';
import { authenticate, authorize, StaffRoles } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/errorHandler';
import { generateBarcodeBase64 } from './barcode.util';

const router = Router();
router.use(authenticate);

/**
 * GET /api/barcodes/search?q=<barcode_or_sku>
 * Universal barcode/SKU search — used by scanners and POS terminals.
 */
router.get('/search', authorize(...StaffRoles), async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) throw new AppError('Search query is required', 400);

    const product = await prisma.product.findFirst({
      where: {
        isActive: true,
        OR: [
          { barcode: q },
          { sku: q },
          { sku: { equals: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        unit: true,
        costPrice: true,
        retailPrice: true,
        wholesalePrice: true,
        wholesaleMinQty: true,
        taxRate: true,
        inventory: { select: { quantityOnHand: true } },
        category: { select: { name: true } },
      },
    });

    if (!product) throw new AppError('No product found for this barcode/SKU', 404);

    sendSuccess(res, product, 'Product found');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/barcodes/generate/:value
 * Generate and return a barcode image (base64 PNG) for any value.
 */
router.get('/generate/:value', authorize(...StaffRoles), async (req, res, next) => {
  try {
    const value = req.params.value.trim();
    if (!value) throw new AppError('Barcode value is required', 400);

    const image = await generateBarcodeBase64(value);
    sendSuccess(res, { value, image });
  } catch (err) {
    next(err);
  }
});

export { router as barcodesRouter };
