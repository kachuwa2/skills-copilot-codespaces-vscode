import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler, notFound } from './middleware/errorHandler';

// Route modules
import { authRouter } from './modules/auth/auth.router';
import { usersRouter } from './modules/users/users.router';
import { categoriesRouter } from './modules/categories/categories.router';
import { suppliersRouter } from './modules/suppliers/suppliers.router';
import { customersRouter } from './modules/customers/customers.router';
import { productsRouter } from './modules/products/products.router';
import { inventoryRouter } from './modules/inventory/inventory.router';
import { purchasesRouter } from './modules/purchases/purchases.router';
import { salesRouter } from './modules/sales/sales.router';
import { barcodesRouter } from './modules/barcodes/barcodes.router';
import { reportsRouter } from './modules/reports/reports.router';

export function createApp() {
  const app = express();

  // ─── Security Middleware ──────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: config.cors.origins,
      credentials: true,
    }),
  );

  // ─── Rate Limiting ────────────────────────────────────────────
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: { success: false, message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', limiter);

  // Stricter rate limit for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: { success: false, message: 'Too many login attempts, please try again later.' },
  });
  // Apply to all auth routes (login, register, refresh, logout, profile, change-password)
  app.use('/api/auth', authLimiter);

  // ─── General Middleware ───────────────────────────────────────
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // HTTP request logging
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.http(msg.trim()) },
    }),
  );

  // ─── Health Check ─────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.env,
      version: '1.0.0',
    });
  });

  // ─── API Routes ───────────────────────────────────────────────
  const API = '/api';

  app.use(`${API}/auth`, authRouter);
  app.use(`${API}/users`, usersRouter);
  app.use(`${API}/categories`, categoriesRouter);
  app.use(`${API}/suppliers`, suppliersRouter);
  app.use(`${API}/customers`, customersRouter);
  app.use(`${API}/products`, productsRouter);
  app.use(`${API}/inventory`, inventoryRouter);
  app.use(`${API}/purchases`, purchasesRouter);
  app.use(`${API}/sales`, salesRouter);
  app.use(`${API}/barcodes`, barcodesRouter);
  app.use(`${API}/reports`, reportsRouter);

  // ─── Error Handling ───────────────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
