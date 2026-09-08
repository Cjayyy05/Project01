import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeploymentStatus } from '../src/generated/prisma/enums.js';
import {
  DeploymentService,
  type DeploymentBuildService,
  type DeploymentContainerService,
  type DeploymentDatabase,
  type DeploymentEvent,
  type DeploymentGitService,
  type DeploymentRecord,
} from '../src/services/deployment.service.js';
import { AppError } from '../src/utils/app-error.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const userId = '99999999-9999-4999-8999-999999999999';
const deploymentId = '22222222-2222-4222-8222-222222222222';
const redeploymentId = '33333333-3333-4333-8333-333333333333';
const containerId = 'a'.repeat(64);
const previousContainerId = 'd'.repeat(64);
const commitHash = 'b'.repeat(40);
const imageId = `sha256:${'c'.repeat(64)}`;
const imageTag =
  `deployflow/project-${projectId}/deployment-${deploymentId}`;
const now = new Date('2026-09-04T01:00:00.000Z');

const project = {
  id: projectId,
  repositoryUrl: 'https://github.com/example/example-api',
  branch: 'main',
  containerPort: 8080,
};

const preparedRepository = {
  repositoryPath: 'C:\\temp\\deployflow-repository-test',
  commitHash,
  metadata: {
    provider: 'github' as const,
    owner: 'example',
    name: 'example-api',
    repositoryUrl: project.repositoryUrl,
    branch: project.branch,
  },
};

const builtImage = { imageId, imageTag };
const startedContainer = {
  containerId,
  hostPort: 49_153,
  status: 'running',
  running: true,
};

describe('DeploymentService', () => {
  let currentDeployment: DeploymentRecord;
  let findProject: ReturnType<
    typeof vi.fn<DeploymentDatabase['project']['findUnique']>
  >;
  let findOwnedProject: ReturnType<
    typeof vi.fn<DeploymentDatabase['project']['findFirst']>
  >;
  let createDeployment: ReturnType<
    typeof vi.fn<DeploymentDatabase['deployment']['create']>
  >;
  let updateDeployment: ReturnType<
    typeof vi.fn<DeploymentDatabase['deployment']['update']>
  >;
  let findDeployments: ReturnType<
    typeof vi.fn<DeploymentDatabase['deployment']['findMany']>
  >;
  let findOwnedDeployment: ReturnType<
    typeof vi.fn<DeploymentDatabase['deployment']['findFirst']>
  >;
  let prepareRepository: ReturnType<
    typeof vi.fn<DeploymentGitService['prepareRepository']>
  >;
  let cleanupRepository: ReturnType<
    typeof vi.fn<DeploymentGitService['cleanup']>
  >;
  let buildImage: ReturnType<
    typeof vi.fn<DeploymentBuildService['buildImage']>
  >;
  let removeImage: ReturnType<
    typeof vi.fn<DeploymentBuildService['removeImage']>
  >;
  let startContainer: ReturnType<
    typeof vi.fn<DeploymentContainerService['startContainer']>
  >;
  let removeContainer: ReturnType<
    typeof vi.fn<DeploymentContainerService['removeContainer']>
  >;
  let database: DeploymentDatabase;
  let gitService: DeploymentGitService;
  let buildService: DeploymentBuildService;
  let containerService: DeploymentContainerService;

  beforeEach(() => {
    currentDeployment = {
      id: deploymentId,
      projectId,
      commitHash: null,
      status: DeploymentStatus.QUEUED,
      containerId: null,
      imageId: null,
      imageTag: null,
      hostPort: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    findProject = vi
      .fn<DeploymentDatabase['project']['findUnique']>()
      .mockResolvedValue(project);
    findOwnedProject = vi
      .fn<DeploymentDatabase['project']['findFirst']>()
      .mockResolvedValue(project);
    createDeployment = vi
      .fn<DeploymentDatabase['deployment']['create']>()
      .mockImplementation(({ data }) => {
        currentDeployment = { ...currentDeployment, ...data };
        return Promise.resolve(currentDeployment);
      });
    updateDeployment = vi
      .fn<DeploymentDatabase['deployment']['update']>()
      .mockImplementation(({ data }) => {
        currentDeployment = { ...currentDeployment, ...data, updatedAt: now };
        return Promise.resolve(currentDeployment);
      });
    findDeployments = vi
      .fn<DeploymentDatabase['deployment']['findMany']>()
      .mockImplementation(() => Promise.resolve([currentDeployment]));
    findOwnedDeployment = vi
      .fn<DeploymentDatabase['deployment']['findFirst']>()
      .mockImplementation(() =>
        Promise.resolve({ ...currentDeployment, project }),
      );
    prepareRepository = vi
      .fn<DeploymentGitService['prepareRepository']>()
      .mockResolvedValue(preparedRepository);
    cleanupRepository = vi
      .fn<DeploymentGitService['cleanup']>()
      .mockResolvedValue(undefined);
    buildImage = vi
      .fn<DeploymentBuildService['buildImage']>()
      .mockImplementation((_input, onOutput) => {
        onOutput?.({ stream: 'Step 1/1 : FROM scratch\n' });
        return Promise.resolve(builtImage);
      });
    removeImage = vi
      .fn<DeploymentBuildService['removeImage']>()
      .mockResolvedValue(undefined);
    startContainer = vi
      .fn<DeploymentContainerService['startContainer']>()
      .mockResolvedValue(startedContainer);
    removeContainer = vi
      .fn<DeploymentContainerService['removeContainer']>()
      .mockResolvedValue(undefined);
    database = {
      project: { findUnique: findProject, findFirst: findOwnedProject },
      deployment: {
        create: createDeployment,
        update: updateDeployment,
        findMany: findDeployments,
        findFirst: findOwnedDeployment,
      },
    };
    gitService = {
      prepareRepository,
      cleanup: cleanupRepository,
    };
    buildService = { buildImage, removeImage };
    containerService = {
      startContainer,
      stopContainer: vi.fn().mockResolvedValue(startedContainer),
      restartContainer: vi.fn().mockResolvedValue(startedContainer),
      removeContainer,
      getLogs: vi.fn().mockResolvedValue(''),
      getCpuStatistics: vi.fn().mockResolvedValue({
        usagePercent: 0,
        totalUsage: 0,
        systemUsage: 0,
        onlineCpus: 1,
      }),
      getMemoryStatistics: vi.fn().mockResolvedValue({
        usageBytes: 0,
        limitBytes: 1,
        usagePercent: 0,
      }),
      getUptime: vi.fn().mockResolvedValue({
        startedAt: null,
        uptimeSeconds: 0,
      }),
    };
  });

  const createService = () =>
    new DeploymentService({
      database,
      gitService,
      buildService,
      containerService,
      now: () => now,
    });

  const configureRedeployRecords = () => {
    const previousDeployment: DeploymentRecord = {
      ...currentDeployment,
      status: DeploymentStatus.RUNNING,
      containerId: previousContainerId,
      imageId,
      imageTag: `deployflow/project-${projectId}/deployment-${deploymentId}`,
      hostPort: 49_152,
      startedAt: now,
    };
    const records = new Map<string, DeploymentRecord>([
      [previousDeployment.id, previousDeployment],
    ]);

    findOwnedDeployment.mockResolvedValue({ ...previousDeployment, project });
    createDeployment.mockImplementation(({ data }) => {
      const replacement: DeploymentRecord = {
        ...currentDeployment,
        id: redeploymentId,
        ...data,
      };
      records.set(replacement.id, replacement);
      currentDeployment = replacement;
      return Promise.resolve(replacement);
    });
    updateDeployment.mockImplementation(({ where, data }) => {
      const existing = records.get(where.id);
      if (existing === undefined) return Promise.reject(new Error('not found'));

      const updated = { ...existing, ...data, updatedAt: now };
      records.set(updated.id, updated);
      if (updated.id === redeploymentId) currentDeployment = updated;
      return Promise.resolve(updated);
    });
    findDeployments.mockImplementation(() =>
      Promise.resolve([...records.values()]),
    );

    return records;
  };

  const recordedStatuses = () => [
    DeploymentStatus.QUEUED,
    ...updateDeployment.mock.calls.flatMap(([options]) =>
      options.data.status === undefined ? [] : [options.data.status],
    ),
  ];

  it('coordinates a successful deployment and emits progress events', async () => {
    const events: DeploymentEvent[] = [];

    const result = await createService().deployProject(projectId, (event) =>
      events.push(event),
    );

    expect(createDeployment).toHaveBeenCalledWith({
      data: { projectId, status: DeploymentStatus.QUEUED },
    });
    expect(prepareRepository).toHaveBeenCalledWith({
      repositoryUrl: project.repositoryUrl,
      branch: project.branch,
    });
    expect(buildImage).toHaveBeenCalledWith(
      {
        repositoryDirectory: preparedRepository.repositoryPath,
        projectId,
        deploymentId,
      },
      expect.any(Function),
    );
    expect(startContainer).toHaveBeenCalledWith({
      imageIdentifier: imageId,
      containerPort: project.containerPort,
      deploymentId,
    });
    expect(cleanupRepository).toHaveBeenCalledWith(
      preparedRepository.repositoryPath,
    );
    expect(recordedStatuses()).toEqual([
      DeploymentStatus.QUEUED,
      DeploymentStatus.CLONING,
      DeploymentStatus.BUILDING,
      DeploymentStatus.STARTING,
      DeploymentStatus.RUNNING,
    ]);
    expect(result).toMatchObject({
      commitHash,
      imageId,
      imageTag,
      containerId,
      hostPort: 49_153,
      status: DeploymentStatus.RUNNING,
      startedAt: now,
      finishedAt: null,
    });
    expect(events).toContainEqual({
      type: 'log',
      deploymentId,
      source: 'build',
      message: 'Step 1/1 : FROM scratch\n',
    });
    expect(events.at(-1)).toEqual({ type: 'completed', deployment: result });
    expect(removeImage).not.toHaveBeenCalled();
    expect(removeContainer).not.toHaveBeenCalled();
  });

  it('cuts over a successful redeploy and preserves both deployment records', async () => {
    const records = configureRedeployRecords();
    const stopContainer = vi.mocked(containerService.stopContainer);
    const events: DeploymentEvent[] = [];

    const result = await createService().redeployDeployment(
      userId,
      deploymentId,
      (event) => events.push(event),
    );

    expect(result).toMatchObject({
      id: redeploymentId,
      status: DeploymentStatus.RUNNING,
      containerId,
    });
    expect(records.get(deploymentId)).toMatchObject({
      id: deploymentId,
      status: DeploymentStatus.STOPPED,
      containerId: previousContainerId,
      finishedAt: now,
    });
    expect(records.get(redeploymentId)?.status).toBe(DeploymentStatus.RUNNING);
    expect(records.size).toBe(2);
    expect(stopContainer).toHaveBeenCalledWith(previousContainerId);
    const runningUpdateIndex = updateDeployment.mock.calls.findIndex(
      ([options]) =>
        options.where.id === redeploymentId &&
        options.data.status === DeploymentStatus.RUNNING,
    );
    const runningUpdateCallOrder =
      updateDeployment.mock.invocationCallOrder[runningUpdateIndex];
    const [stopCallOrder] = stopContainer.mock.invocationCallOrder;
    if (runningUpdateCallOrder === undefined || stopCallOrder === undefined) {
      throw new Error('Expected running persistence before old-container stop');
    }
    expect(runningUpdateCallOrder).toBeLessThan(stopCallOrder);
    expect(events).toContainEqual({
      type: 'status',
      deploymentId,
      status: DeploymentStatus.STOPPED,
    });
    expect(removeImage).not.toHaveBeenCalled();
  });

  it('does not stop the previous deployment when its replacement fails', async () => {
    const records = configureRedeployRecords();
    const stopContainer = vi.mocked(containerService.stopContainer);
    buildImage.mockRejectedValue(new AppError(422, 'Docker image build failed'));

    await expect(
      createService().redeployDeployment(userId, deploymentId),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: 'Docker image build failed',
    });

    expect(records.get(deploymentId)?.status).toBe(DeploymentStatus.RUNNING);
    expect(records.get(redeploymentId)?.status).toBe(DeploymentStatus.FAILED);
    expect(stopContainer).not.toHaveBeenCalled();
  });

  it('marks a clone failure without exposing the infrastructure error', async () => {
    prepareRepository.mockRejectedValue(
      new Error('clone failed with https://secret-token@example.test'),
    );
    const events: DeploymentEvent[] = [];

    await expect(
      createService().deployProject(projectId, (event) => events.push(event)),
    ).rejects.toMatchObject({
      name: 'AppError',
      statusCode: 422,
      message: 'Repository preparation failed',
    });

    expect(recordedStatuses()).toEqual([
      DeploymentStatus.QUEUED,
      DeploymentStatus.CLONING,
      DeploymentStatus.FAILED,
    ]);
    expect(currentDeployment).toMatchObject({
      status: DeploymentStatus.FAILED,
      errorMessage: 'Repository preparation failed',
      finishedAt: now,
    });
    expect(currentDeployment.errorMessage).not.toContain('secret-token');
    expect(cleanupRepository).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({
      type: 'failed',
      errorMessage: 'Repository preparation failed',
    });
  });

  it('marks a build failure and cleans the prepared repository', async () => {
    buildImage.mockRejectedValue(new AppError(422, 'Docker image build failed'));

    await expect(createService().deployProject(projectId)).rejects.toMatchObject({
      statusCode: 422,
      message: 'Docker image build failed',
    });

    expect(recordedStatuses()).toEqual([
      DeploymentStatus.QUEUED,
      DeploymentStatus.CLONING,
      DeploymentStatus.BUILDING,
      DeploymentStatus.FAILED,
    ]);
    expect(cleanupRepository).toHaveBeenCalledWith(
      preparedRepository.repositoryPath,
    );
    expect(removeImage).not.toHaveBeenCalled();
    expect(startContainer).not.toHaveBeenCalled();
  });

  it('marks container startup failure and removes the built image', async () => {
    startContainer.mockRejectedValue(
      new AppError(422, 'Unable to create and start container'),
    );

    await expect(createService().deployProject(projectId)).rejects.toMatchObject({
      statusCode: 422,
      message: 'Unable to create and start container',
    });

    expect(recordedStatuses()).toEqual([
      DeploymentStatus.QUEUED,
      DeploymentStatus.CLONING,
      DeploymentStatus.BUILDING,
      DeploymentStatus.STARTING,
      DeploymentStatus.FAILED,
    ]);
    expect(removeImage).toHaveBeenCalledWith(imageTag);
    expect(cleanupRepository).toHaveBeenCalledWith(
      preparedRepository.repositoryPath,
    );
    expect(removeContainer).not.toHaveBeenCalled();
  });

  it('removes all owned runtime resources after a post-start failure', async () => {
    updateDeployment.mockImplementation(({ data }) => {
      if (data.containerId !== undefined) {
        return Promise.reject(new Error('database write failed'));
      }

      currentDeployment = { ...currentDeployment, ...data, updatedAt: now };
      return Promise.resolve(currentDeployment);
    });

    await expect(createService().deployProject(projectId)).rejects.toMatchObject({
      statusCode: 422,
      message: 'Container startup failed',
    });

    expect(removeContainer).toHaveBeenCalledWith(containerId);
    expect(removeImage).toHaveBeenCalledWith(imageTag);
    expect(cleanupRepository).toHaveBeenCalledWith(
      preparedRepository.repositoryPath,
    );
    expect(currentDeployment.status).toBe(DeploymentStatus.FAILED);
  });

  it('fails safely and removes runtime resources when repository cleanup fails', async () => {
    cleanupRepository.mockRejectedValue(
      new AppError(500, 'Unable to clean up temporary repository'),
    );

    await expect(createService().deployProject(projectId)).rejects.toMatchObject({
      statusCode: 500,
      message: 'Unable to clean up temporary repository',
    });

    expect(removeContainer).toHaveBeenCalledWith(containerId);
    expect(removeImage).toHaveBeenCalledWith(imageTag);
    expect(cleanupRepository).toHaveBeenCalledTimes(2);
    expect(currentDeployment).toMatchObject({
      status: DeploymentStatus.FAILED,
      errorMessage: 'Unable to clean up temporary repository',
      finishedAt: now,
    });
  });

  it('isolates event callback failures from deployment execution', async () => {
    const result = await createService().deployProject(projectId, () => {
      throw new Error('event consumer unavailable');
    });

    expect(result.status).toBe(DeploymentStatus.RUNNING);
    expect(cleanupRepository).toHaveBeenCalledOnce();
  });
});
