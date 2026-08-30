import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { router } from './routes';
import { getHealth } from './controllers/health.controller';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', getHealth);
  app.use('/api', router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
