import { AppError } from './app-error.js';
import { parseGitHubRepositoryUrl } from './github-repository.js';
import { parseHealthCheckPath } from './health-check-path.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProjectInput = {
  name: string;
  repositoryUrl: string;
  branch: string;
  containerPort: number;
  healthCheckPath: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseProjectInput = (body: unknown): ProjectInput => {
  if (!isRecord(body)) {
    throw new AppError(400, 'Request body must be a JSON object');
  }

  if (typeof body.name !== 'string') {
    throw new AppError(400, 'Project name is required');
  }

  const name = body.name.trim();

  if (name.length === 0 || name.length > 100) {
    throw new AppError(400, 'Project name must be between 1 and 100 characters');
  }

  const { repositoryUrl } = parseGitHubRepositoryUrl(body.repositoryUrl);
  const branch = body.branch === undefined ? 'main' : body.branch;

  if (
    typeof branch !== 'string' ||
    branch.trim().length === 0 ||
    branch.length > 255
  ) {
    throw new AppError(400, 'Branch must be between 1 and 255 characters');
  }

  if (
    typeof body.containerPort !== 'number' ||
    !Number.isInteger(body.containerPort) ||
    body.containerPort < 1 ||
    body.containerPort > 65_535
  ) {
    throw new AppError(400, 'Container port must be an integer from 1 to 65535');
  }

  return {
    name,
    repositoryUrl,
    branch: branch.trim(),
    containerPort: body.containerPort,
    healthCheckPath: parseHealthCheckPath(body.healthCheckPath),
  };
};

export const parseProjectHealthCheckInput = (
  body: unknown,
): { healthCheckPath: string } => {
  if (!isRecord(body)) {
    throw new AppError(400, 'Request body must be a JSON object');
  }

  if (body.healthCheckPath === undefined) {
    throw new AppError(400, 'Health-check path is required');
  }

  return { healthCheckPath: parseHealthCheckPath(body.healthCheckPath) };
};

export const parseProjectId = (value: unknown): string => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new AppError(400, 'Project ID must be a valid UUID');
  }

  return value;
};
