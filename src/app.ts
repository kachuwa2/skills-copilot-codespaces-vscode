import 'dotenv/config';
import { createApp } from './server';
import { connectDatabase, disconnectDatabase } from './config/database';
import { config } from './config';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  const app = createApp();

  await connectDatabase();

  const server = app.listen(config.port, () => {
    logger.info(`🚀 Inventory Management System started`);
    logger.info(`📡 Environment: ${config.env}`);
    logger.info(`🌐 Server: http://localhost:${config.port}`);
    logger.info(`🔗 Health check: http://localhost:${config.port}/health`);
    logger.info(`📚 API Base: http://localhost:${config.port}/api`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Server closed.');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Unhandled rejection safety net
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', { reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', { err });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
