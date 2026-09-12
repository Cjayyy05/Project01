import { database } from '../config/database.js';
import {
  DeploymentStatus,
  type DeploymentStatus as DeploymentStatusValue,
} from '../generated/prisma/enums.js';
import { AppError } from '../utils/app-error.js';
import {
  dockerBuildService,
  type DockerBuildOutput,
  type DockerBuildResult,
} from './docker-build.service.js';
import {
  containerService,
  type ContainerCpuStatistics,
  type ContainerMemoryStatistics,
  type ContainerUptime,
  type StartContainerResult,
} from './container.service.js';
import {
  gitRepositoryService,
  type PreparedGitRepository,
} from './git-repository.service.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DeploymentProject = {
  id: string;
  repositoryUrl: string;
  branch: string;
  containerPort: number;
};

export type DeploymentRecord = {
  id: string;
  projectId: string;
  commitHash: string | null;
  status: DeploymentStatusValue;
  containerId: string | null;
  imageId: string | null;
  imageTag: string | null;
  hostPort: number | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DeploymentMetrics = {
  status: DeploymentStatusValue;
  cpu: ContainerCpuStatistics;
  memory: ContainerMemoryStatistics;
  uptime: ContainerUptime;
};

export type OwnedDeployment = DeploymentRecord & {
  project: DeploymentProject;
};

export type DeploymentEvent =
  | {
      type: 'status';
      deploymentId: string;
      status: DeploymentStatusValue;
    }
  | {
      type: 'log';
      deploymentId: string;
      source: 'deployment' | 'build';
      message: string;
    }
  | {
      type: 'completed';
      deployment: DeploymentRecord;
    }
  | {
      type: 'failed';
      deployment: DeploymentRecord;
      errorMessage: string;
    };

export type DeploymentEventCallback = (event: DeploymentEvent) => void;

export type DeploymentUpdateData = {
  status?: DeploymentStatusValue;
  commitHash?: string;
  containerId?: string;
  imageId?: string;
  imageTag?: string;
  hostPort?: number;
  errorMessage?: string | null;
  startedAt?: Date;
  finishedAt?: Date | null;
};

export type DeploymentDatabase = {
  project: {
    findUnique: (options: {
      where: { id: string };
      select: {
        id: true;
        repositoryUrl: true;
        branch: true;
        containerPort: true;
      };
    }) => Promise<DeploymentProject | null>;
    findFirst: (options: {
      where: { id: string; userId: string };
      select: {
        id: true;
        repositoryUrl: true;
        branch: true;
        containerPort: true;
      };
    }) => Promise<DeploymentProject | null>;
  };
  deployment: {
    create: (options: {
      data: { projectId: string; status: DeploymentStatusValue };
    }) => Promise<DeploymentRecord>;
    update: (options: {
      where: { id: string };
      data: DeploymentUpdateData;
    }) => Promise<DeploymentRecord>;
    findMany: (options: {
      where: { projectId: string };
      orderBy: { createdAt: 'desc' };
    }) => Promise<DeploymentRecord[]>;
    findFirst: (options: {
      where: { id: string; project: { userId: string } };
      include: {
        project: {
          select: {
            id: true;
            repositoryUrl: true;
            branch: true;
            containerPort: true;
          };
        };
      };
    }) => Promise<OwnedDeployment | null>;
  };
};

export type DeploymentGitService = Pick<
  typeof gitRepositoryService,
  'prepareRepository' | 'cleanup'
>;

export type DeploymentBuildService = Pick<
  typeof dockerBuildService,
  'buildImage' | 'removeImage'
>;

export type DeploymentContainerService = Pick<
  typeof containerService,
  | 'startContainer'
  | 'stopContainer'
  | 'restartContainer'
  | 'removeContainer'
  | 'getLogs'
  | 'getCpuStatistics'
  | 'getMemoryStatistics'
  | 'getUptime'
>;

export type DeploymentServiceDependencies = {
  database?: DeploymentDatabase;
  gitService?: DeploymentGitService;
  buildService?: DeploymentBuildService;
  containerService?: DeploymentContainerService;
  now?: () => Date;
};

const parseIdentifier = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new AppError(400, `${label} must be a valid UUID`);
  }

  return value.toLowerCase();
};

const formatBuildOutput = (output: DockerBuildOutput): string | null => {
  if (output.stream !== undefined && output.stream.length > 0) {
    return output.stream;
  }

  const status = output.status ?? '';
  const progress = output.progress ?? '';
  const message = `${status} ${progress}`.trim();

  if (message.length > 0) return message;
  if (output.error !== undefined && output.error.length > 0) return output.error;
  return null;
};

const getSafeFailureMessage = (
  error: unknown,
  stage: DeploymentStatusValue,
): string => {
  if (error instanceof AppError) return error.message;

  switch (stage) {
    case DeploymentStatus.CLONING:
      return 'Repository preparation failed';
    case DeploymentStatus.BUILDING:
      return 'Docker image build failed';
    case DeploymentStatus.STARTING:
      return 'Container startup failed';
    case DeploymentStatus.RUNNING:
      return 'Deployment cleanup failed';
    default:
      return 'Deployment initialization failed';
  }
};

export class DeploymentService {
  readonly #database: DeploymentDatabase;
  readonly #gitService: DeploymentGitService;
  readonly #buildService: DeploymentBuildService;
  readonly #containerService: DeploymentContainerService;
  readonly #now: () => Date;

  public constructor(dependencies: DeploymentServiceDependencies = {}) {
    this.#database = dependencies.database ?? database;
    this.#gitService = dependencies.gitService ?? gitRepositoryService;
    this.#buildService = dependencies.buildService ?? dockerBuildService;
    this.#containerService =
      dependencies.containerService ?? containerService;
    this.#now = dependencies.now ?? (() => new Date());
  }

  public async deployProjectForUser(
    userId: string,
    rawProjectId: unknown,
    onEvent?: DeploymentEventCallback,
  ): Promise<DeploymentRecord> {
    const projectId = parseIdentifier(rawProjectId, 'Project ID');
    await this.#getOwnedProject(userId, projectId);
    return this.deployProject(projectId, onEvent);
  }

  public async listProjectDeployments(
    userId: string,
    rawProjectId: unknown,
  ): Promise<DeploymentRecord[]> {
    const projectId = parseIdentifier(rawProjectId, 'Project ID');
    await this.#getOwnedProject(userId, projectId);

    return this.#database.deployment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async getDeploymentForUser(
    userId: string,
    rawDeploymentId: unknown,
  ): Promise<DeploymentRecord> {
    const deployment = await this.#getOwnedDeployment(
      userId,
      parseIdentifier(rawDeploymentId, 'Deployment ID'),
    );
    return this.#withoutProject(deployment);
  }

  public async stopDeployment(
    userId: string,
    rawDeploymentId: unknown,
    onEvent?: DeploymentEventCallback,
  ): Promise<DeploymentRecord> {
    const deployment = await this.#getOwnedDeployment(
      userId,
      parseIdentifier(rawDeploymentId, 'Deployment ID'),
    );
    const containerId = this.#requireContainerId(deployment);

    try {
      await this.#containerService.stopContainer(containerId);
      const stoppedDeployment = await this.#updateDeployment(deployment.id, {
        status: DeploymentStatus.STOPPED,
        finishedAt: this.#now(),
      });
      this.#emit(onEvent, {
        type: 'status',
        deploymentId: stoppedDeployment.id,
        status: DeploymentStatus.STOPPED,
      });
      return stoppedDeployment;
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, 'Unable to stop deployment');
    }
  }

  public async restartDeployment(
    userId: string,
    rawDeploymentId: unknown,
    onEvent?: DeploymentEventCallback,
  ): Promise<DeploymentRecord> {
    const deployment = await this.#getOwnedDeployment(
      userId,
      parseIdentifier(rawDeploymentId, 'Deployment ID'),
    );
    const containerId = this.#requireContainerId(deployment);

    try {
      await this.#updateDeployment(deployment.id, {
        status: DeploymentStatus.STARTING,
      });
      this.#emit(onEvent, {
        type: 'status',
        deploymentId: deployment.id,
        status: DeploymentStatus.STARTING,
      });
      const restartedContainer = await this.#containerService.restartContainer(
        containerId,
        deployment.project.containerPort,
      );
      const runningDeployment = await this.#updateDeployment(deployment.id, {
        status: DeploymentStatus.RUNNING,
        hostPort: restartedContainer.hostPort,
        startedAt: this.#now(),
        finishedAt: null,
        errorMessage: null,
      });
      this.#emit(onEvent, {
        type: 'status',
        deploymentId: runningDeployment.id,
        status: DeploymentStatus.RUNNING,
      });
      return runningDeployment;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof AppError ? error.message : 'Unable to restart deployment';

      try {
        const failedDeployment = await this.#updateDeployment(deployment.id, {
          status: DeploymentStatus.FAILED,
          errorMessage,
          finishedAt: this.#now(),
        });
        this.#emit(onEvent, {
          type: 'status',
          deploymentId: failedDeployment.id,
          status: DeploymentStatus.FAILED,
        });
        this.#emit(onEvent, {
          type: 'failed',
          deployment: failedDeployment,
          errorMessage,
        });
      } catch {
        // Preserve the restart failure when its status cannot also be persisted.
      }

      const statusCode = error instanceof AppError ? error.statusCode : 500;
      throw new AppError(statusCode, errorMessage);
    }
  }

  public async redeployDeployment(
    userId: string,
    rawDeploymentId: unknown,
    onEvent?: DeploymentEventCallback,
  ): Promise<DeploymentRecord> {
    const previousDeployment = await this.#getOwnedDeployment(
      userId,
      parseIdentifier(rawDeploymentId, 'Deployment ID'),
    );
    return this.deployProjectReplacingRunning(
      previousDeployment.projectId,
      onEvent,
    );
  }

  public async deployProjectReplacingRunning(
    rawProjectId: unknown,
    onEvent?: DeploymentEventCallback,
  ): Promise<DeploymentRecord> {
    const projectId = parseIdentifier(rawProjectId, 'Project ID');
    const newDeployment = await this.deployProject(projectId, onEvent);

    await this.#stopPreviousRunningDeployments(
      projectId,
      newDeployment.id,
      onEvent,
    );

    return newDeployment;
  }

  public async getDeploymentLogs(
    userId: string,
    rawDeploymentId: unknown,
  ): Promise<string> {
    const deployment = await this.#getOwnedDeployment(
      userId,
      parseIdentifier(rawDeploymentId, 'Deployment ID'),
    );
    return this.#containerService.getLogs(this.#requireContainerId(deployment));
  }

  public async getDeploymentMetrics(
    userId: string,
    rawDeploymentId: unknown,
  ): Promise<DeploymentMetrics> {
    const deployment = await this.#getOwnedDeployment(
      userId,
      parseIdentifier(rawDeploymentId, 'Deployment ID'),
    );
    const containerId = this.#requireContainerId(deployment);
    const [cpu, memory, uptime] = await Promise.all([
      this.#containerService.getCpuStatistics(containerId),
      this.#containerService.getMemoryStatistics(containerId),
      this.#containerService.getUptime(containerId),
    ]);

    return { status: deployment.status, cpu, memory, uptime };
  }

  public async deployProject(
    rawProjectId: unknown,
    onEvent?: DeploymentEventCallback,
  ): Promise<DeploymentRecord> {
    const projectId = parseIdentifier(rawProjectId, 'Project ID');
    let project: DeploymentProject | null;

    try {
      project = await this.#database.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          repositoryUrl: true,
          branch: true,
          containerPort: true,
        },
      });
    } catch {
      throw new AppError(500, 'Unable to initialize deployment');
    }

    if (project === null) throw new AppError(404, 'Project not found');

    let deployment: DeploymentRecord;

    try {
      deployment = await this.#database.deployment.create({
        data: { projectId, status: DeploymentStatus.QUEUED },
      });
    } catch {
      throw new AppError(500, 'Unable to initialize deployment');
    }
    this.#emit(onEvent, {
      type: 'status',
      deploymentId: deployment.id,
      status: DeploymentStatus.QUEUED,
    });

    let stage: DeploymentStatusValue = DeploymentStatus.QUEUED;
    let repository: PreparedGitRepository | undefined;
    let image: DockerBuildResult | undefined;
    let startedContainer: StartContainerResult | undefined;

    try {
      stage = DeploymentStatus.CLONING;
      deployment = await this.#changeStatus(deployment.id, stage, onEvent);
      this.#emitLog(onEvent, deployment.id, 'deployment', 'Cloning repository');
      repository = await this.#gitService.prepareRepository({
        repositoryUrl: project.repositoryUrl,
        branch: project.branch,
      });
      deployment = await this.#updateDeployment(deployment.id, {
        commitHash: repository.commitHash,
      });

      stage = DeploymentStatus.BUILDING;
      deployment = await this.#changeStatus(deployment.id, stage, onEvent);
      image = await this.#buildService.buildImage(
        {
          repositoryDirectory: repository.repositoryPath,
          projectId,
          deploymentId: deployment.id,
        },
        (output) => {
          const message = formatBuildOutput(output);
          if (message !== null) {
            this.#emitLog(onEvent, deployment.id, 'build', message);
          }
        },
      );
      deployment = await this.#updateDeployment(deployment.id, {
        imageId: image.imageId,
        imageTag: image.imageTag,
      });

      stage = DeploymentStatus.STARTING;
      deployment = await this.#changeStatus(deployment.id, stage, onEvent);
      startedContainer = await this.#containerService.startContainer({
        imageIdentifier: image.imageId,
        containerPort: project.containerPort,
        deploymentId: deployment.id,
      });
      deployment = await this.#updateDeployment(deployment.id, {
        containerId: startedContainer.containerId,
        hostPort: startedContainer.hostPort,
      });

      stage = DeploymentStatus.RUNNING;
      deployment = await this.#updateDeployment(deployment.id, {
        status: stage,
        startedAt: this.#now(),
        finishedAt: null,
        errorMessage: null,
      });
      this.#emit(onEvent, {
        type: 'status',
        deploymentId: deployment.id,
        status: stage,
      });

      await this.#gitService.cleanup(repository.repositoryPath);
      repository = undefined;

      this.#emit(onEvent, { type: 'completed', deployment });
      return deployment;
    } catch (error: unknown) {
      const errorMessage = getSafeFailureMessage(error, stage);
      await this.#cleanupResources(repository, image, startedContainer);

      try {
        deployment = await this.#updateDeployment(deployment.id, {
          status: DeploymentStatus.FAILED,
          errorMessage,
          finishedAt: this.#now(),
        });
      } catch {
        throw new AppError(500, 'Deployment failed and status could not be saved');
      }

      this.#emit(onEvent, {
        type: 'status',
        deploymentId: deployment.id,
        status: DeploymentStatus.FAILED,
      });
      this.#emit(onEvent, {
        type: 'failed',
        deployment,
        errorMessage,
      });

      const statusCode = error instanceof AppError ? error.statusCode : 422;
      throw new AppError(statusCode, errorMessage);
    }
  }

  async #changeStatus(
    deploymentId: string,
    status: DeploymentStatusValue,
    onEvent: DeploymentEventCallback | undefined,
  ): Promise<DeploymentRecord> {
    const deployment = await this.#updateDeployment(deploymentId, { status });
    this.#emit(onEvent, { type: 'status', deploymentId, status });
    return deployment;
  }

  #updateDeployment(
    deploymentId: string,
    data: DeploymentUpdateData,
  ): Promise<DeploymentRecord> {
    return this.#database.deployment.update({
      where: { id: deploymentId },
      data,
    });
  }

  async #getOwnedProject(
    userId: string,
    projectId: string,
  ): Promise<DeploymentProject> {
    const project = await this.#database.project.findFirst({
      where: { id: projectId, userId },
      select: {
        id: true,
        repositoryUrl: true,
        branch: true,
        containerPort: true,
      },
    });

    if (project === null) throw new AppError(404, 'Project not found');
    return project;
  }

  async #getOwnedDeployment(
    userId: string,
    deploymentId: string,
  ): Promise<OwnedDeployment> {
    const deployment = await this.#database.deployment.findFirst({
      where: { id: deploymentId, project: { userId } },
      include: {
        project: {
          select: {
            id: true,
            repositoryUrl: true,
            branch: true,
            containerPort: true,
          },
        },
      },
    });

    if (deployment === null) throw new AppError(404, 'Deployment not found');
    return deployment;
  }

  #requireContainerId(deployment: DeploymentRecord): string {
    if (deployment.containerId === null) {
      throw new AppError(409, 'Deployment does not have a container');
    }

    return deployment.containerId;
  }

  #withoutProject(deployment: OwnedDeployment): DeploymentRecord {
    return {
      id: deployment.id,
      projectId: deployment.projectId,
      commitHash: deployment.commitHash,
      status: deployment.status,
      containerId: deployment.containerId,
      imageId: deployment.imageId,
      imageTag: deployment.imageTag,
      hostPort: deployment.hostPort,
      errorMessage: deployment.errorMessage,
      startedAt: deployment.startedAt,
      finishedAt: deployment.finishedAt,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
    };
  }

  async #stopPreviousRunningDeployments(
    projectId: string,
    activeDeploymentId: string,
    onEvent: DeploymentEventCallback | undefined,
  ): Promise<void> {
    let deployments: DeploymentRecord[];

    try {
      deployments = await this.#database.deployment.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      });
    } catch {
      throw new AppError(
        500,
        'New deployment is running but previous deployments could not be stopped',
      );
    }

    const previousRunningDeployments = deployments.filter(
      (deployment) =>
        deployment.id !== activeDeploymentId &&
        deployment.status === DeploymentStatus.RUNNING,
    );

    for (const deployment of previousRunningDeployments) {
      if (deployment.containerId === null) {
        throw new AppError(
          500,
          'New deployment is running but a previous deployment could not be stopped',
        );
      }

      try {
        await this.#containerService.stopContainer(deployment.containerId);
        const stoppedDeployment = await this.#updateDeployment(deployment.id, {
          status: DeploymentStatus.STOPPED,
          finishedAt: this.#now(),
        });
        this.#emit(onEvent, {
          type: 'status',
          deploymentId: stoppedDeployment.id,
          status: DeploymentStatus.STOPPED,
        });
      } catch {
        throw new AppError(
          500,
          'New deployment is running but a previous deployment could not be stopped',
        );
      }
    }
  }

  async #cleanupResources(
    repository: PreparedGitRepository | undefined,
    image: DockerBuildResult | undefined,
    startedContainer: StartContainerResult | undefined,
  ): Promise<void> {
    if (startedContainer !== undefined) {
      try {
        await this.#containerService.removeContainer(startedContainer.containerId);
      } catch {
        // Preserve the original deployment failure.
      }
    }

    if (image !== undefined) {
      try {
        await this.#buildService.removeImage(image.imageTag);
      } catch {
        // Preserve the original deployment failure.
      }
    }

    if (repository !== undefined) {
      try {
        await this.#gitService.cleanup(repository.repositoryPath);
      } catch {
        // Preserve the original deployment failure.
      }
    }
  }

  #emitLog(
    onEvent: DeploymentEventCallback | undefined,
    deploymentId: string,
    source: 'deployment' | 'build',
    message: string,
  ): void {
    this.#emit(onEvent, {
      type: 'log',
      deploymentId,
      source,
      message,
    });
  }

  #emit(
    onEvent: DeploymentEventCallback | undefined,
    event: DeploymentEvent,
  ): void {
    try {
      onEvent?.(event);
    } catch {
      // Event consumers must not interrupt deployment orchestration.
    }
  }
}

export const deploymentService = new DeploymentService();
