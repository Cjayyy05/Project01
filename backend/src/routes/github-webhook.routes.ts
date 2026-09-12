import { Router } from 'express';

import { receiveGitHubWebhook } from '../controllers/github-webhook.controller.js';

export const githubWebhookRouter = Router();

githubWebhookRouter.post('/:projectId', receiveGitHubWebhook);
