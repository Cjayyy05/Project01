import type { RequestHandler } from 'express';

import { broadcastDeploymentEvent } from '../realtime/deployment-socket.js';
import { deploymentService } from '../services/deployment.service.js';
import { githubWebhookService } from '../services/github-webhook.service.js';
import { getAuthenticatedUserId } from '../utils/auth-request.js';

export const getGitHubWebhookConfiguration: RequestHandler = async (
  request,
  response,
) => {
  const webhook = await githubWebhookService.getConfiguration(
    getAuthenticatedUserId(request),
    request.params.id,
  );

  response.set('Cache-Control', 'no-store');
  response.status(200).json({ webhook });
};

export const receiveGitHubWebhook: RequestHandler = async (
  request,
  response,
) => {
  const result = await githubWebhookService.process(
    {
      projectId: request.params.projectId,
      signature: request.headers['x-hub-signature-256'],
      event: request.headers['x-github-event'],
      deliveryId: request.headers['x-github-delivery'],
      rawBody: request.body,
    },
    (projectId) => {
      void deploymentService
        .deployProjectReplacingRunning(projectId, broadcastDeploymentEvent)
        .catch(() => {
          // DeploymentService persists and emits safe failure details when possible.
        });
    },
  );

  response.status(202).json(result);
};
