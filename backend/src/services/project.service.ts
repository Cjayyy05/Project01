import { database } from '../config/database.js';
import { AppError } from '../utils/app-error.js';

type CreateProjectData = {
  name: string;
  repositoryUrl: string;
  branch: string;
  containerPort: number;
  healthCheckPath: string;
};

const projectSelect = {
  id: true,
  userId: true,
  name: true,
  repositoryUrl: true,
  branch: true,
  containerPort: true,
  healthCheckPath: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const createProject = async (
  userId: string,
  data: CreateProjectData,
) =>
  database.project.create({
    data: { ...data, userId },
    select: projectSelect,
  });

export const listProjects = async (userId: string) =>
  database.project.findMany({
    where: { userId },
    select: projectSelect,
    orderBy: { createdAt: 'desc' },
  });

export const getProject = async (userId: string, projectId: string) => {
  const project = await database.project.findFirst({
    where: { id: projectId, userId },
    select: projectSelect,
  });

  if (project === null) {
    throw new AppError(404, 'Project not found');
  }

  return project;
};

export const updateProjectHealthCheck = async (
  userId: string,
  projectId: string,
  healthCheckPath: string,
) => {
  const result = await database.project.updateMany({
    where: { id: projectId, userId },
    data: { healthCheckPath },
  });

  if (result.count === 0) {
    throw new AppError(404, 'Project not found');
  }

  return getProject(userId, projectId);
};

export const deleteProject = async (
  userId: string,
  projectId: string,
): Promise<void> => {
  const result = await database.project.deleteMany({
    where: { id: projectId, userId },
  });

  if (result.count === 0) {
    throw new AppError(404, 'Project not found');
  }
};
