import { Router } from 'express';

import {
  create,
  getById,
  list,
  remove,
} from '../controllers/project.controller.js';
import {
  deployProject,
  listProjectDeployments,
} from '../controllers/deployment.controller.js';
import { authenticate } from '../middleware/authenticate.js';

export const projectRouter = Router();

projectRouter.use(authenticate);
projectRouter.post('/', create);
projectRouter.get('/', list);
projectRouter.post('/:id/deploy', deployProject);
projectRouter.get('/:id/deployments', listProjectDeployments);
projectRouter.get('/:id', getById);
projectRouter.delete('/:id', remove);
