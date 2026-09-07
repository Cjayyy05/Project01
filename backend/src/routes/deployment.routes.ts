import { Router } from 'express';

import {
  getDeployment,
  getDeploymentLogs,
  getDeploymentMetrics,
  redeployDeployment,
  restartDeployment,
  stopDeployment,
} from '../controllers/deployment.controller.js';
import { authenticate } from '../middleware/authenticate.js';

export const deploymentRouter = Router();

deploymentRouter.use(authenticate);
deploymentRouter.get('/:id', getDeployment);
deploymentRouter.post('/:id/stop', stopDeployment);
deploymentRouter.post('/:id/restart', restartDeployment);
deploymentRouter.post('/:id/redeploy', redeployDeployment);
deploymentRouter.get('/:id/logs', getDeploymentLogs);
deploymentRouter.get('/:id/metrics', getDeploymentMetrics);
