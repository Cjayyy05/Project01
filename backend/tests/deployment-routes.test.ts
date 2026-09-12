import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({
  projectFindUnique: vi.fn<(args: unknown) => Promise<unknown>>(),
  projectFindFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  projectUpdateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(),
  deploymentCreate: vi.fn<(args: unknown) => Promise<unknown>>(),
  deploymentUpdate: vi.fn<(args: unknown) => Promise<unknown>>(),
  deploymentFindFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  deploymentFindMany: vi.fn<(args: unknown) => Promise<unknown[]>>(),
}));

const infrastructureMocks = vi.hoisted(() => ({
  waitUntilHealthy: vi.fn<(args: unknown) => Promise<void>>(),
  prepareBuild: vi.fn<(args: unknown) => Promise<unknown>>(),
  prepareRepository: vi.fn<(args: unknown) => Promise<unknown>>(),
  prepareRepositoryAtCommit: vi.fn<(args: unknown) => Promise<unknown>>(),
  cleanupRepository: vi.fn<(path: string) => Promise<void>>(),
  buildImage: vi.fn<
    (
      input: unknown,
      onOutput?: (output: { stream?: string }) => void,
    ) => Promise<{ imageId: string; imageTag: string }>
  >(),
  removeImage: vi.fn<(imageIdentifier: string) => Promise<void>>(),
  imageExists: vi.fn<(imageIdentifier: string) => Promise<boolean>>(),
  startContainer: vi.fn<(args: unknown) => Promise<unknown>>(),
  stopContainer: vi.fn<(containerId: string) => Promise<unknown>>(),
  restartContainer: vi.fn<
    (containerId: string, containerPort: number) => Promise<unknown>
  >(),
  removeContainer: vi.fn<(containerId: string) => Promise<void>>(),
  getLogs: vi.fn<(containerId: string) => Promise<string>>(),
  getCpuStatistics: vi.fn<(containerId: string) => Promise<unknown>>(),
  getMemoryStatistics: vi.fn<(containerId: string) => Promise<unknown>>(),
  getUptime: vi.fn<(containerId: string) => Promise<unknown>>(),
}));

vi.mock('../src/config/database.js', () => ({
  database: {
    project: {
      findUnique: databaseMocks.projectFindUnique,
      findFirst: databaseMocks.projectFindFirst,
      updateMany: databaseMocks.projectUpdateMany,
    },
    deployment: {
      create: databaseMocks.deploymentCreate,
      update: databaseMocks.deploymentUpdate,
      findFirst: databaseMocks.deploymentFindFirst,
      findMany: databaseMocks.deploymentFindMany,
    },
  },
}));

vi.mock('../src/services/git-repository.service.js', () => ({
  gitRepositoryService: {
    prepareRepository: infrastructureMocks.prepareRepository,
    prepareRepositoryAtCommit: infrastructureMocks.prepareRepositoryAtCommit,
    cleanup: infrastructureMocks.cleanupRepository,
  },
}));

vi.mock('../src/services/application-detector.service.js', () => ({
  applicationDetector: {
    prepareBuild: infrastructureMocks.prepareBuild,
  },
}));

vi.mock('../src/services/application-health-check.service.js', () => ({
  applicationHealthCheckService: {
    waitUntilHealthy: infrastructureMocks.waitUntilHealthy,
  },
}));

vi.mock('../src/services/docker-build.service.js', () => ({
  dockerBuildService: {
    buildImage: infrastructureMocks.buildImage,
    imageExists: infrastructureMocks.imageExists,
    removeImage: infrastructureMocks.removeImage,
  },
}));

vi.mock('../src/services/container.service.js', () => ({
  containerService: {
    startContainer: infrastructureMocks.startContainer,
    stopContainer: infrastructureMocks.stopContainer,
    restartContainer: infrastructureMocks.restartContainer,
    removeContainer: infrastructureMocks.removeContainer,
    getLogs: infrastructureMocks.getLogs,
    getCpuStatistics: infrastructureMocks.getCpuStatistics,
    getMemoryStatistics: infrastructureMocks.getMemoryStatistics,
    getUptime: infrastructureMocks.getUptime,
  },
}));

import { createApp } from '../src/app.js';
import { DeploymentStatus } from '../src/generated/prisma/enums.js';
import { createAccessToken } from '../src/services/token.service.js';

const userId = '352bd66d-41b7-4c0d-a148-8a236647677b';
const projectId = 'a382fb3d-dce4-4470-8e41-89a181466ce8';
const oldDeploymentId = 'b382fb3d-dce4-4470-8e41-89a181466ce8';
const newDeploymentId = 'c382fb3d-dce4-4470-8e41-89a181466ce8';
const containerId = 'a'.repeat(64);
const imageId = `sha256:${'b'.repeat(64)}`;
const imageTag = `deployflow/project-${projectId}/deployment-${newDeploymentId}`;
const commitHash = 'c'.repeat(40);
const now = new Date('2026-09-04T03:00:00.000Z');

const project = {
  id: projectId,
  repositoryUrl: 'https://github.com/example/example-api',
  branch: 'main',
  containerPort: 8080,
  healthCheckPath: '/health',
};

const createDeploymentRecord = (
  id: string,
  status: (typeof DeploymentStatus)[keyof typeof DeploymentStatus],
) => ({
  id,
  projectId,
  rollbackSourceDeploymentId: null,
  applicationType: null,
  commitHash: status === DeploymentStatus.QUEUED ? null : commitHash,
  status,
  containerId: status === DeploymentStatus.QUEUED ? null : containerId,
  imageId: status === DeploymentStatus.QUEUED ? null : imageId,
  imageTag: status === DeploymentStatus.QUEUED ? null : imageTag,
  hostPort: status === DeploymentStatus.QUEUED ? null : 49_153,
  errorMessage: null,
  startedAt: status === DeploymentStatus.RUNNING ? now : null,
  finishedAt: null,
  createdAt: now,
  updatedAt: now,
});

let authorization: string;
let records: Map<string, ReturnType<typeof createDeploymentRecord>>;

beforeAll(async () => {
  authorization = `Bearer ${await createAccessToken(userId)}`;
});

beforeEach(() => {
  vi.clearAllMocks();
  const oldDeployment = createDeploymentRecord(
    oldDeploymentId,
    DeploymentStatus.RUNNING,
  );
  records = new Map([[oldDeploymentId, oldDeployment]]);

  databaseMocks.projectFindFirst.mockResolvedValue(project);
  databaseMocks.projectFindUnique.mockResolvedValue(project);
  databaseMocks.projectUpdateMany.mockResolvedValue({ count: 1 });
  databaseMocks.deploymentCreate.mockImplementation((rawOptions) => {
    const options = rawOptions as {
      data: Partial<ReturnType<typeof createDeploymentRecord>> & {
        status: typeof DeploymentStatus.QUEUED;
      };
    };
    const deployment = {
      ...createDeploymentRecord(newDeploymentId, options.data.status),
      ...options.data,
    };
    records.set(newDeploymentId, deployment);
    return Promise.resolve(deployment);
  });
  databaseMocks.deploymentUpdate.mockImplementation((rawOptions) => {
    const options = rawOptions as {
      where: { id: string };
      data: Partial<ReturnType<typeof createDeploymentRecord>>;
    };
    const existing = records.get(options.where.id);

    if (existing === undefined) return Promise.reject(new Error('not found'));

    const updated = { ...existing, ...options.data, updatedAt: now };
    records.set(options.where.id, updated);
    return Promise.resolve(updated);
  });
  databaseMocks.deploymentFindFirst.mockImplementation((rawOptions) => {
    const options = rawOptions as { where: { id: string } };
    const deployment = records.get(options.where.id);
    return Promise.resolve(
      deployment === undefined ? null : { ...deployment, project },
    );
  });
  databaseMocks.deploymentFindMany.mockImplementation(() =>
    Promise.resolve([...records.values()]),
  );

  infrastructureMocks.prepareRepository.mockResolvedValue({
    repositoryPath: 'C:\\temp\\deployflow-route-test',
    commitHash,
    metadata: {
      provider: 'github',
      owner: 'example',
      name: 'example-api',
      repositoryUrl: project.repositoryUrl,
      branch: project.branch,
    },
  });
  infrastructureMocks.prepareBuild.mockResolvedValue({
    applicationType: 'DOCKERFILE',
    generatedDockerfile: false,
    framework: 'dockerfile',
  });
  infrastructureMocks.waitUntilHealthy.mockResolvedValue(undefined);
  infrastructureMocks.prepareRepositoryAtCommit.mockResolvedValue({
    repositoryPath: 'C:\\temp\\deployflow-route-test',
    commitHash,
    metadata: {
      provider: 'github',
      owner: 'example',
      name: 'example-api',
      repositoryUrl: project.repositoryUrl,
      branch: project.branch,
    },
  });
  infrastructureMocks.cleanupRepository.mockResolvedValue(undefined);
  infrastructureMocks.buildImage.mockImplementation((_input, onOutput) => {
    onOutput?.({ stream: 'Successfully built image\n' });
    return Promise.resolve({ imageId, imageTag });
  });
  infrastructureMocks.removeImage.mockResolvedValue(undefined);
  infrastructureMocks.imageExists.mockResolvedValue(true);
  infrastructureMocks.startContainer.mockResolvedValue({
    containerId,
    hostPort: 49_153,
    status: 'running',
    running: true,
  });
  infrastructureMocks.stopContainer.mockResolvedValue({
    containerId,
    status: 'exited',
    running: false,
  });
  infrastructureMocks.restartContainer.mockResolvedValue({
    containerId,
    hostPort: 49_154,
    status: 'running',
    running: true,
  });
  infrastructureMocks.removeContainer.mockResolvedValue(undefined);
  infrastructureMocks.getLogs.mockResolvedValue('application output\n');
  infrastructureMocks.getCpuStatistics.mockResolvedValue({
    usagePercent: 12.5,
    totalUsage: 300,
    systemUsage: 2_000,
    onlineCpus: 4,
  });
  infrastructureMocks.getMemoryStatistics.mockResolvedValue({
    usageBytes: 256,
    limitBytes: 1_024,
    usagePercent: 25,
  });
  infrastructureMocks.getUptime.mockResolvedValue({
    startedAt: now.toISOString(),
    uptimeSeconds: 120,
  });
});

describe('deployment REST endpoints', () => {
  it('returns a conflict while another project operation holds the lease', async () => {
    databaseMocks.projectUpdateMany.mockResolvedValueOnce({ count: 0 });

    const response = await request(createApp())
      .post(`/api/projects/${projectId}/deploy`)
      .set('Authorization', authorization);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        message: 'Another deployment operation is already active for this project',
      },
    });
    expect(databaseMocks.deploymentCreate).not.toHaveBeenCalled();
  });

  it('accepts a valid owned deployment request', async () => {
    const response = await request(createApp())
      .post(`/api/projects/${projectId}/deploy`)
      .set('Authorization', authorization);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      deployment: {
        id: newDeploymentId,
        projectId,
        status: DeploymentStatus.RUNNING,
        commitHash,
        imageId,
        containerId,
        hostPort: 49_153,
      },
    });
    expect(databaseMocks.projectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: projectId, userId } }),
    );
    expect(infrastructureMocks.startContainer).toHaveBeenCalledOnce();
  });

  it('rejects deployment access not owned through the related project', async () => {
    databaseMocks.deploymentFindFirst.mockResolvedValue(null);

    const response = await request(createApp())
      .get(`/api/deployments/${oldDeploymentId}`)
      .set('Authorization', authorization);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { message: 'Deployment not found' },
    });
    expect(databaseMocks.deploymentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: oldDeploymentId, project: { userId } },
      }),
    );
  });

  it('stops the owned running container and marks the deployment stopped', async () => {
    const response = await request(createApp())
      .post(`/api/deployments/${oldDeploymentId}/stop`)
      .set('Authorization', authorization);

    expect(response.status).toBe(200);
    expect(infrastructureMocks.stopContainer).toHaveBeenCalledWith(containerId);
    expect(response.body).toMatchObject({
      deployment: {
        id: oldDeploymentId,
        status: DeploymentStatus.STOPPED,
      },
    });
    const body = response.body as { deployment: { finishedAt: unknown } };
    expect(typeof body.deployment.finishedAt).toBe('string');
  });

  it('restarts the same container and restores running status', async () => {
    const stopped = createDeploymentRecord(
      oldDeploymentId,
      DeploymentStatus.STOPPED,
    );
    records.set(oldDeploymentId, stopped);

    const response = await request(createApp())
      .post(`/api/deployments/${oldDeploymentId}/restart`)
      .set('Authorization', authorization);

    expect(response.status).toBe(200);
    expect(infrastructureMocks.restartContainer).toHaveBeenCalledWith(
      containerId,
      project.containerPort,
    );
    expect(infrastructureMocks.startContainer).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      deployment: {
        id: oldDeploymentId,
        status: DeploymentStatus.RUNNING,
        hostPort: 49_154,
        finishedAt: null,
      },
    });
  });

  it('stops the previous running deployment only after redeploy succeeds', async () => {
    const response = await request(createApp())
      .post(`/api/deployments/${oldDeploymentId}/redeploy`)
      .set('Authorization', authorization);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      deployment: {
        id: newDeploymentId,
        projectId,
        status: DeploymentStatus.RUNNING,
      },
    });
    expect(records.get(oldDeploymentId)).toMatchObject({
      id: oldDeploymentId,
      status: DeploymentStatus.STOPPED,
      containerId,
    });
    expect(records.get(oldDeploymentId)?.finishedAt).toBeInstanceOf(Date);
    expect(records.get(newDeploymentId)?.status).toBe(DeploymentStatus.RUNNING);
    expect(records.size).toBe(2);
    expect(databaseMocks.deploymentCreate).toHaveBeenCalledOnce();
    expect(infrastructureMocks.prepareRepository).toHaveBeenCalledWith({
      repositoryUrl: project.repositoryUrl,
      branch: project.branch,
    });
    expect(infrastructureMocks.stopContainer).toHaveBeenCalledWith(containerId);
    const [startCallOrder] =
      infrastructureMocks.startContainer.mock.invocationCallOrder;
    const [stopCallOrder] =
      infrastructureMocks.stopContainer.mock.invocationCallOrder;
    if (startCallOrder === undefined || stopCallOrder === undefined) {
      throw new Error('Expected both container lifecycle calls');
    }
    expect(startCallOrder).toBeLessThan(stopCallOrder);
    expect(infrastructureMocks.removeImage).not.toHaveBeenCalled();
  });

  it('leaves the previous deployment running when redeploy fails', async () => {
    infrastructureMocks.buildImage.mockRejectedValue(
      new Error('build failed with an internal registry detail'),
    );

    const response = await request(createApp())
      .post(`/api/deployments/${oldDeploymentId}/redeploy`)
      .set('Authorization', authorization);

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: { message: 'Docker image build failed' },
    });
    expect(records.get(oldDeploymentId)?.status).toBe(DeploymentStatus.RUNNING);
    expect(records.get(newDeploymentId)?.status).toBe(DeploymentStatus.FAILED);
    expect(infrastructureMocks.stopContainer).not.toHaveBeenCalled();
  });

  it('checks ownership before starting a redeploy', async () => {
    databaseMocks.deploymentFindFirst.mockResolvedValue(null);

    const response = await request(createApp())
      .post(`/api/deployments/${oldDeploymentId}/redeploy`)
      .set('Authorization', authorization);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { message: 'Deployment not found' },
    });
    expect(databaseMocks.deploymentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: oldDeploymentId, project: { userId } },
      }),
    );
    expect(databaseMocks.deploymentCreate).not.toHaveBeenCalled();
    expect(infrastructureMocks.prepareRepository).not.toHaveBeenCalled();
    expect(infrastructureMocks.stopContainer).not.toHaveBeenCalled();
  });

  it('creates a new owned rollback deployment through the REST endpoint', async () => {
    const response = await request(createApp())
      .post(`/api/deployments/${oldDeploymentId}/rollback`)
      .set('Authorization', authorization);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      deployment: {
        id: newDeploymentId,
        projectId,
        rollbackSourceDeploymentId: oldDeploymentId,
        commitHash,
        status: DeploymentStatus.RUNNING,
      },
    });
    expect(databaseMocks.deploymentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: oldDeploymentId, project: { userId } },
      }),
    );
    expect(infrastructureMocks.imageExists).toHaveBeenCalledWith(imageId);
    expect(infrastructureMocks.startContainer).toHaveBeenCalledWith({
      imageIdentifier: imageId,
      containerPort: project.containerPort,
      deploymentId: newDeploymentId,
    });
  });

  it('rejects an unauthorized rollback before creating a deployment', async () => {
    databaseMocks.deploymentFindFirst.mockResolvedValue(null);

    const response = await request(createApp())
      .post(`/api/deployments/${oldDeploymentId}/rollback`)
      .set('Authorization', authorization);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { message: 'Deployment not found' },
    });
    expect(databaseMocks.deploymentCreate).not.toHaveBeenCalled();
    expect(infrastructureMocks.imageExists).not.toHaveBeenCalled();
    expect(infrastructureMocks.startContainer).not.toHaveBeenCalled();
  });

  it('checks deployment ownership before returning metrics', async () => {
    databaseMocks.deploymentFindFirst.mockResolvedValue(null);

    const response = await request(createApp())
      .get(`/api/deployments/${oldDeploymentId}/metrics`)
      .set('Authorization', authorization);

    expect(response.status).toBe(404);
    expect(infrastructureMocks.getCpuStatistics).not.toHaveBeenCalled();
    expect(infrastructureMocks.getMemoryStatistics).not.toHaveBeenCalled();
    expect(infrastructureMocks.getUptime).not.toHaveBeenCalled();
  });

  it('returns current metrics for an owned deployment', async () => {
    const response = await request(createApp())
      .get(`/api/deployments/${oldDeploymentId}/metrics`)
      .set('Authorization', authorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      metrics: {
        status: DeploymentStatus.RUNNING,
        cpu: {
          usagePercent: 12.5,
          totalUsage: 300,
          systemUsage: 2_000,
          onlineCpus: 4,
        },
        memory: {
          usageBytes: 256,
          limitBytes: 1_024,
          usagePercent: 25,
        },
        uptime: { startedAt: now.toISOString(), uptimeSeconds: 120 },
      },
    });
  });

  it('lists owned project history and returns runtime logs', async () => {
    const historyResponse = await request(createApp())
      .get(`/api/projects/${projectId}/deployments`)
      .set('Authorization', authorization);
    const logsResponse = await request(createApp())
      .get(`/api/deployments/${oldDeploymentId}/logs`)
      .set('Authorization', authorization);

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body).toMatchObject({
      deployments: [{ id: oldDeploymentId, projectId }],
    });
    expect(logsResponse.status).toBe(200);
    expect(logsResponse.body).toEqual({ logs: 'application output\n' });
  });
});
