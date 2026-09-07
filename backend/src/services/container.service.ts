import Dockerode from 'dockerode';

import { AppError } from '../utils/app-error.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTAINER_ID_PATTERN = /^[0-9a-f]{12,64}$/i;
const HOST_PORT_PATTERN = /^\d{1,5}$/;
const MAX_IMAGE_IDENTIFIER_LENGTH = 512;

export type StartContainerInput = {
  imageIdentifier: string;
  containerPort: number;
  deploymentId: string;
};

export type ContainerRuntimeStatus = {
  containerId: string;
  status: string;
  running: boolean;
};

export type StartContainerResult = ContainerRuntimeStatus & {
  hostPort: number;
};

export type ContainerLogsOptions = {
  tail?: number;
  timestamps?: boolean;
};

export type ContainerCpuStatistics = {
  usagePercent: number;
  totalUsage: number;
  systemUsage: number;
  onlineCpus: number;
};

export type ContainerMemoryStatistics = {
  usageBytes: number;
  limitBytes: number;
  usagePercent: number;
};

export type ContainerUptime = {
  startedAt: string | null;
  uptimeSeconds: number;
};

export type ContainerCreateOptions = {
  name: string;
  Image: string;
  ExposedPorts: Record<string, Record<string, never>>;
  HostConfig: {
    PortBindings: Record<string, { HostPort: string }[]>;
  };
  Labels: Record<string, string>;
};

type ContainerInspectResult = {
  Id?: unknown;
  State?: {
    Status?: unknown;
    Running?: unknown;
    StartedAt?: unknown;
    FinishedAt?: unknown;
  };
  NetworkSettings?: {
    Ports?: Record<string, unknown>;
  };
};

export type DockerContainer = {
  id: string;
  start: () => Promise<unknown>;
  stop: () => Promise<unknown>;
  restart: () => Promise<unknown>;
  remove: (options: { force: boolean }) => Promise<unknown>;
  inspect: () => Promise<ContainerInspectResult>;
  logs: (options: {
    stdout: boolean;
    stderr: boolean;
    follow: false;
    timestamps: boolean;
    tail: number | 'all';
  }) => Promise<Buffer | string>;
  stats: (options: { stream: false }) => Promise<unknown>;
};

export type DockerClient = {
  createContainer: (options: ContainerCreateOptions) => Promise<DockerContainer>;
  getContainer: (id: string) => DockerContainer;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getRecord = (
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined => {
  const child = value[key];
  return isRecord(child) ? child : undefined;
};

const getFiniteNumber = (
  value: Record<string, unknown> | undefined,
  key: string,
): number | undefined => {
  const candidate = value?.[key];
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? candidate
    : undefined;
};

const parseContainerId = (containerId: string): string => {
  if (!CONTAINER_ID_PATTERN.test(containerId)) {
    throw new AppError(400, 'Container ID is invalid');
  }

  return containerId.toLowerCase();
};

const parseContainerPort = (containerPort: number): number => {
  if (
    !Number.isInteger(containerPort) ||
    containerPort < 1 ||
    containerPort > 65_535
  ) {
    throw new AppError(400, 'Container port must be an integer from 1 to 65535');
  }

  return containerPort;
};

const parseStartInput = (input: StartContainerInput): StartContainerInput => {
  const imageIdentifier = input.imageIdentifier.trim();

  if (
    imageIdentifier.length === 0 ||
    imageIdentifier.length > MAX_IMAGE_IDENTIFIER_LENGTH ||
    /\s/.test(imageIdentifier)
  ) {
    throw new AppError(400, 'Image identifier is invalid');
  }

  if (!UUID_PATTERN.test(input.deploymentId)) {
    throw new AppError(400, 'Deployment ID must be a valid UUID');
  }

  return {
    imageIdentifier,
    containerPort: parseContainerPort(input.containerPort),
    deploymentId: input.deploymentId.toLowerCase(),
  };
};

const parseTail = (tail: number | undefined): number | 'all' => {
  if (tail === undefined) return 'all';

  if (!Number.isInteger(tail) || tail < 0 || tail > 100_000) {
    throw new AppError(400, 'Log tail must be an integer from 0 to 100000');
  }

  return tail;
};

const toOperationError = (error: unknown, message: string): AppError => {
  if (error instanceof AppError) return error;

  const statusCode =
    isRecord(error) && error.statusCode === 404 ? 404 : 422;
  return new AppError(statusCode, message);
};

const readRuntimeStatus = (
  inspectResult: ContainerInspectResult,
  fallbackId: string,
): ContainerRuntimeStatus => {
  const containerId =
    typeof inspectResult.Id === 'string' && inspectResult.Id.length > 0
      ? inspectResult.Id
      : fallbackId;
  const status = inspectResult.State?.Status;
  const running = inspectResult.State?.Running;

  if (typeof status !== 'string' || typeof running !== 'boolean') {
    throw new AppError(500, 'Docker returned invalid container status');
  }

  return { containerId, status, running };
};

const readHostPort = (
  inspectResult: ContainerInspectResult,
  containerPort: number,
): number => {
  const binding =
    inspectResult.NetworkSettings?.Ports?.[`${String(containerPort)}/tcp`];

  if (!Array.isArray(binding) || !isRecord(binding[0])) {
    throw new AppError(500, 'Docker did not assign a host port');
  }

  const rawHostPort = binding[0].HostPort;
  const hostPort =
    typeof rawHostPort === 'string' && HOST_PORT_PATTERN.test(rawHostPort)
      ? Number(rawHostPort)
      : NaN;

  if (!Number.isInteger(hostPort) || hostPort < 1 || hostPort > 65_535) {
    throw new AppError(500, 'Docker returned an invalid host port');
  }

  return hostPort;
};

const decodeDockerLogs = (logs: Buffer | string): string => {
  if (typeof logs === 'string' || logs.length < 8) {
    return logs.toString();
  }

  const chunks: Buffer[] = [];
  let offset = 0;

  while (offset < logs.length) {
    if (logs.length - offset < 8) return logs.toString('utf8');

    const streamType = logs.readUInt8(offset);
    const frameLength = logs.readUInt32BE(offset + 4);
    const frameStart = offset + 8;
    const frameEnd = frameStart + frameLength;

    if (
      (streamType !== 0 && streamType !== 1 && streamType !== 2) ||
      logs.readUIntBE(offset + 1, 3) !== 0 ||
      frameEnd > logs.length
    ) {
      return logs.toString('utf8');
    }

    chunks.push(logs.subarray(frameStart, frameEnd));
    offset = frameEnd;
  }

  return Buffer.concat(chunks).toString('utf8');
};

const parseDockerDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' || value.startsWith('0001-01-01')) return null;

  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
};

export class ContainerService {
  readonly #docker: DockerClient;
  readonly #now: () => number;

  public constructor(
    docker: DockerClient = new Dockerode() as unknown as DockerClient,
    now: () => number = Date.now,
  ) {
    this.#docker = docker;
    this.#now = now;
  }

  public async startContainer(
    rawInput: StartContainerInput,
  ): Promise<StartContainerResult> {
    const input = parseStartInput(rawInput);
    const portKey = `${String(input.containerPort)}/tcp`;
    let container: DockerContainer | undefined;

    try {
      container = await this.#docker.createContainer({
        name: `deployflow-deployment-${input.deploymentId}`,
        Image: input.imageIdentifier,
        ExposedPorts: { [portKey]: {} },
        HostConfig: {
          PortBindings: { [portKey]: [{ HostPort: '' }] },
        },
        Labels: { 'deployflow.deployment-id': input.deploymentId },
      });
      await container.start();

      const details = await container.inspect();
      return {
        ...readRuntimeStatus(details, container.id),
        hostPort: readHostPort(details, input.containerPort),
      };
    } catch (error: unknown) {
      if (container !== undefined) await this.#cleanupFailedContainer(container);
      throw toOperationError(error, 'Unable to create and start container');
    }
  }

  public async stopContainer(
    rawContainerId: string,
  ): Promise<ContainerRuntimeStatus> {
    const container = this.#getContainer(rawContainerId);

    try {
      await container.stop();
      return readRuntimeStatus(await container.inspect(), container.id);
    } catch (error: unknown) {
      throw toOperationError(error, 'Unable to stop container');
    }
  }

  public async restartContainer(
    rawContainerId: string,
    rawContainerPort: number,
  ): Promise<StartContainerResult> {
    const container = this.#getContainer(rawContainerId);
    const containerPort = parseContainerPort(rawContainerPort);

    try {
      await container.restart();
      const details = await container.inspect();
      return {
        ...readRuntimeStatus(details, container.id),
        hostPort: readHostPort(details, containerPort),
      };
    } catch (error: unknown) {
      throw toOperationError(error, 'Unable to restart container');
    }
  }

  public async removeContainer(rawContainerId: string): Promise<void> {
    const container = this.#getContainer(rawContainerId);

    try {
      await container.remove({ force: true });
    } catch (error: unknown) {
      throw toOperationError(error, 'Unable to remove container');
    }
  }

  public async inspectStatus(
    rawContainerId: string,
  ): Promise<ContainerRuntimeStatus> {
    const container = this.#getContainer(rawContainerId);

    try {
      return readRuntimeStatus(await container.inspect(), container.id);
    } catch (error: unknown) {
      throw toOperationError(error, 'Unable to inspect container status');
    }
  }

  public async getLogs(
    rawContainerId: string,
    options: ContainerLogsOptions = {},
  ): Promise<string> {
    const container = this.#getContainer(rawContainerId);
    const tail = parseTail(options.tail);

    try {
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        follow: false,
        timestamps: options.timestamps ?? false,
        tail,
      });
      return decodeDockerLogs(logs);
    } catch (error: unknown) {
      throw toOperationError(error, 'Unable to retrieve container logs');
    }
  }

  public async getCpuStatistics(
    rawContainerId: string,
  ): Promise<ContainerCpuStatistics> {
    const statistics = await this.#getStatistics(rawContainerId);
    const cpu = getRecord(statistics, 'cpu_stats');
    const previousCpu = getRecord(statistics, 'precpu_stats');
    const usage = cpu === undefined ? undefined : getRecord(cpu, 'cpu_usage');
    const previousUsage =
      previousCpu === undefined ? undefined : getRecord(previousCpu, 'cpu_usage');
    const totalUsage = getFiniteNumber(usage, 'total_usage');
    const previousTotalUsage = getFiniteNumber(previousUsage, 'total_usage');
    const systemUsage = getFiniteNumber(cpu, 'system_cpu_usage');
    const previousSystemUsage = getFiniteNumber(
      previousCpu,
      'system_cpu_usage',
    );
    const onlineCpus = getFiniteNumber(cpu, 'online_cpus') ?? 1;

    if (
      totalUsage === undefined ||
      previousTotalUsage === undefined ||
      systemUsage === undefined ||
      previousSystemUsage === undefined ||
      onlineCpus < 1
    ) {
      throw new AppError(500, 'Docker returned invalid CPU statistics');
    }

    const cpuDelta = totalUsage - previousTotalUsage;
    const systemDelta = systemUsage - previousSystemUsage;
    const usagePercent =
      cpuDelta > 0 && systemDelta > 0
        ? (cpuDelta / systemDelta) * onlineCpus * 100
        : 0;

    return { usagePercent, totalUsage, systemUsage, onlineCpus };
  }

  public async getMemoryStatistics(
    rawContainerId: string,
  ): Promise<ContainerMemoryStatistics> {
    const statistics = await this.#getStatistics(rawContainerId);
    const memory = getRecord(statistics, 'memory_stats');
    const usageBytes = getFiniteNumber(memory, 'usage');
    const limitBytes = getFiniteNumber(memory, 'limit');

    if (
      usageBytes === undefined ||
      usageBytes < 0 ||
      limitBytes === undefined ||
      limitBytes <= 0
    ) {
      throw new AppError(500, 'Docker returned invalid memory statistics');
    }

    return {
      usageBytes,
      limitBytes,
      usagePercent: (usageBytes / limitBytes) * 100,
    };
  }

  public async getUptime(rawContainerId: string): Promise<ContainerUptime> {
    const container = this.#getContainer(rawContainerId);

    try {
      const details = await container.inspect();
      const startedAt = parseDockerDate(details.State?.StartedAt);

      if (startedAt === null) return { startedAt: null, uptimeSeconds: 0 };

      const finishedAt = parseDockerDate(details.State?.FinishedAt);
      const endTime = details.State?.Running === true || finishedAt === null
        ? this.#now()
        : finishedAt.getTime();

      return {
        startedAt: startedAt.toISOString(),
        uptimeSeconds: Math.max(
          0,
          Math.floor((endTime - startedAt.getTime()) / 1000),
        ),
      };
    } catch (error: unknown) {
      throw toOperationError(error, 'Unable to retrieve container uptime');
    }
  }

  #getContainer(rawContainerId: string): DockerContainer {
    return this.#docker.getContainer(parseContainerId(rawContainerId));
  }

  async #getStatistics(rawContainerId: string): Promise<Record<string, unknown>> {
    const container = this.#getContainer(rawContainerId);

    try {
      const statistics = await container.stats({ stream: false });

      if (!isRecord(statistics)) {
        throw new AppError(500, 'Docker returned invalid container statistics');
      }

      return statistics;
    } catch (error: unknown) {
      throw toOperationError(error, 'Unable to retrieve container statistics');
    }
  }

  async #cleanupFailedContainer(container: DockerContainer): Promise<void> {
    try {
      await container.remove({ force: true });
    } catch {
      // Preserve the startup failure if Docker cannot remove the partial container.
    }
  }
}

export const containerService = new ContainerService();
