import express from 'express';

import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { authRouter } from './routes/auth.routes.js';
import { deploymentRouter } from './routes/deployment.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { projectRouter } from './routes/project.routes.js';

export const createApp = (): express.Express => {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectRouter);
  app.use('/api/deployments', deploymentRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
