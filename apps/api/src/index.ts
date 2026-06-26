import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';

import { config } from './config/app.config';
import { logger } from './utils/logger';
import { connectDatabase } from './config/database.config';
import { connectRedis } from './config/redis.config';
import { setupApolloServer } from './graphql';
import { setupRestRoutes } from './config/routes.config';
import { errorHandler } from './middleware/error.middleware';
import { rateLimiter } from './middleware/rate-limiter.middleware';

async function bootstrap() {
  const app = express();
  const httpServer = createServer(app);

  // --- Core Middleware ---
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.webUrl, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('combined', { stream: { write: (msg) => logger.http(msg.trim()) } }));
  app.use(rateLimiter);

  // --- Health Check ---
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
  });

  // --- Connect DB & Redis ---
  await connectDatabase();
  await connectRedis();

  // --- REST Routes ---
  setupRestRoutes(app);

  // --- GraphQL (Apollo Server) ---
  await setupApolloServer(app, httpServer);

  // --- Global Error Handler ---
  app.use(errorHandler);

  // --- Start Server ---
  httpServer.listen(config.port, () => {
    logger.info(`🚀 API Server running on http://localhost:${config.port}`);
    logger.info(`📊 GraphQL Playground: http://localhost:${config.port}/graphql`);
    logger.info(`🌍 Environment: ${config.nodeEnv}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
