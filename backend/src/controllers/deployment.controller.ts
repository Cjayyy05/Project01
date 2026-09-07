import type { RequestHandler } from 'express';

import { broadcastDeploymentEvent } from '../realtime/deployment-socket.js';
import { deploymentService } from '../services/deployment.service.js';
import { getAuthenticatedUserId } from '../utils/auth-request.js';

export const deployProject: RequestHandler = async (request, response) => {
  const deployment = await deploymentService.deployProjectForUser(
    getAuthenticatedUserId(request),
    request.params.id,
    broadcastDeploymentEvent,
  );

  response.status(201).json({ deployment });
};

export const listProjectDeployments: RequestHandler = async (
  request,
  response,
) => {
  const deployments = await deploymentService.listProjectDeployments(
    getAuthenticatedUserId(request),
    request.params.id,
  );

  response.status(200).json({ deployments });
};

export const getDeployment: RequestHandler = async (request, response) => {
  const deployment = await deploymentService.getDeploymentForUser(
    getAuthenticatedUserId(request),
    request.params.id,
  );

  response.status(200).json({ deployment });
};

export const stopDeployment: RequestHandler = async (request, response) => {
  const deployment = await deploymentService.stopDeployment(
    getAuthenticatedUserId(request),
    request.params.id,
    broadcastDeploymentEvent,
  );

  response.status(200).json({ deployment });
};

export const restartDeployment: RequestHandler = async (request, response) => {
  const deployment = await deploymentService.restartDeployment(
    getAuthenticatedUserId(request),
    request.params.id,
    broadcastDeploymentEvent,
  );

  response.status(200).json({ deployment });
};

export const redeployDeployment: RequestHandler = async (request, response) => {
  const deployment = await deploymentService.redeployDeployment(
    getAuthenticatedUserId(request),
    request.params.id,
    broadcastDeploymentEvent,
  );

  response.status(201).json({ deployment });
};

export const getDeploymentLogs: RequestHandler = async (request, response) => {
  const logs = await deploymentService.getDeploymentLogs(
    getAuthenticatedUserId(request),
    request.params.id,
  );

  response.status(200).json({ logs });
};

export const getDeploymentMetrics: RequestHandler = async (
  request,
  response,
) => {
  const metrics = await deploymentService.getDeploymentMetrics(
    getAuthenticatedUserId(request),
    request.params.id,
  );

  response.status(200).json({ metrics });
};
