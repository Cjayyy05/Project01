import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ContainerService,
  type DockerClient,
  type DockerContainer,
} from '../src/services/container.service.js';

const containerId = 'a'.repeat(64);
const deploymentId = '22222222-2222-4222-8222-222222222222';
const startedAt = '2026-09-04T00:00:00.000Z';

const runningInspectResult = {
  Id: containerId,
  State: {
    Status: 'running',
    Running: true,
    StartedAt: startedAt,
    FinishedAt: '0001-01-01T00:00:00Z',
  },
  NetworkSettings: {
    Ports: { '8080/tcp': [{ HostIp: '0.0.0.0', HostPort: '49153' }] },
  },
};

const stoppedInspectResult = {
  ...runningInspectResult,
  State: {
    Status: 'exited',
    Running: false,
    StartedAt: startedAt,
    FinishedAt: '2026-09-04T00:01:30.900Z',
  },
};

const createLogFrame = (streamType: number, content: string): Buffer => {
  const payload = Buffer.from(content);
  const header = Buffer.alloc(8);
  header.writeUInt8(streamType, 0);
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
};

describe('ContainerService', () => {
  type MockedContainer = DockerContainer & {
    start: ReturnType<typeof vi.fn<DockerContainer['start']>>;
    stop: ReturnType<typeof vi.fn<DockerContainer['stop']>>;
    restart: ReturnType<typeof vi.fn<DockerContainer['restart']>>;
    remove: ReturnType<typeof vi.fn<DockerContainer['remove']>>;
    inspect: ReturnType<typeof vi.fn<DockerContainer['inspect']>>;
    logs: ReturnType<typeof vi.fn<DockerContainer['logs']>>;
    stats: ReturnType<typeof vi.fn<DockerContainer['stats']>>;
  };
  type MockedDocker = DockerClient & {
    createContainer: ReturnType<typeof vi.fn<DockerClient['createContainer']>>;
    getContainer: ReturnType<typeof vi.fn<DockerClient['getContainer']>>;
  };

  let container: MockedContainer;
  let docker: MockedDocker;

  beforeEach(() => {
    container = {
      id: containerId,
      start: vi.fn<DockerContainer['start']>().mockResolvedValue(undefined),
      stop: vi.fn<DockerContainer['stop']>().mockResolvedValue(undefined),
      restart: vi.fn<DockerContainer['restart']>().mockResolvedValue(undefined),
      remove: vi.fn<DockerContainer['remove']>().mockResolvedValue(undefined),
      inspect: vi
        .fn<DockerContainer['inspect']>()
        .mockResolvedValue(runningInspectResult),
      logs: vi
        .fn<DockerContainer['logs']>()
        .mockResolvedValue(Buffer.from('application output\n')),
      stats: vi.fn<DockerContainer['stats']>().mockResolvedValue({
        cpu_stats: {
          cpu_usage: { total_usage: 300 },
          system_cpu_usage: 2_000,
          online_cpus: 4,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 100 },
          system_cpu_usage: 1_000,
        },
        memory_stats: { usage: 256, limit: 1_024 },
      }),
    };
    docker = {
      createContainer: vi
        .fn<DockerClient['createContainer']>()
        .mockResolvedValue(container),
      getContainer: vi
        .fn<DockerClient['getContainer']>()
        .mockReturnValue(container),
    };
  });

  it('creates and starts a container with a Docker-assigned host port', async () => {
    const service = new ContainerService(docker);

    const result = await service.startContainer({
      imageIdentifier: 'deployflow/example:latest',
      containerPort: 8080,
      deploymentId,
    });

    expect(docker.createContainer).toHaveBeenCalledWith({
      name: `deployflow-deployment-${deploymentId}`,
      Image: 'deployflow/example:latest',
      ExposedPorts: { '8080/tcp': {} },
      HostConfig: {
        PortBindings: {
          '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '' }],
        },
        LogConfig: {
          Type: 'json-file',
          Config: { 'max-size': '10m', 'max-file': '3' },
        },
      },
      Labels: { 'deployflow.deployment-id': deploymentId },
    });
    expect(container.start).toHaveBeenCalledOnce();
    expect(container.inspect).toHaveBeenCalledOnce();
    expect(result).toEqual({
      containerId,
      hostPort: 49_153,
      status: 'running',
      running: true,
    });
    expect(container.remove).not.toHaveBeenCalled();
  });

  it('removes a container when startup fails', async () => {
    container.start.mockRejectedValue(new Error('port allocation failed'));
    const service = new ContainerService(docker);

    await expect(
      service.startContainer({
        imageIdentifier: 'deployflow/example:latest',
        containerPort: 8080,
        deploymentId,
      }),
    ).rejects.toMatchObject({
      name: 'AppError',
      statusCode: 422,
      message: 'Unable to create and start container',
    });
    expect(container.remove).toHaveBeenCalledWith({ force: true });
  });

  it('cleans up when Docker does not return an assigned host port', async () => {
    container.inspect.mockResolvedValue({
      ...runningInspectResult,
      NetworkSettings: { Ports: { '8080/tcp': null } },
    });
    const service = new ContainerService(docker);

    await expect(
      service.startContainer({
        imageIdentifier: 'deployflow/example:latest',
        containerPort: 8080,
        deploymentId,
      }),
    ).rejects.toMatchObject({
      name: 'AppError',
      statusCode: 500,
      message: 'Docker did not assign a host port',
    });
    expect(container.remove).toHaveBeenCalledWith({ force: true });
  });

  it('rejects malformed Docker host ports and cleans up the container', async () => {
    container.inspect.mockResolvedValue({
      ...runningInspectResult,
      NetworkSettings: {
        Ports: { '8080/tcp': [{ HostPort: '49153garbage' }] },
      },
    });
    const service = new ContainerService(docker);

    await expect(
      service.startContainer({
        imageIdentifier: 'deployflow/example:latest',
        containerPort: 8080,
        deploymentId,
      }),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: 'Docker returned an invalid host port',
    });
    expect(container.remove).toHaveBeenCalledWith({ force: true });
  });

  it('stops without removing the container and returns its updated status', async () => {
    container.inspect.mockResolvedValue(stoppedInspectResult);
    const service = new ContainerService(docker);

    const result = await service.stopContainer(containerId.toUpperCase());

    expect(docker.getContainer).toHaveBeenCalledWith(containerId);
    expect(container.stop).toHaveBeenCalledOnce();
    expect(container.remove).not.toHaveBeenCalled();
    expect(result).toEqual({
      containerId,
      status: 'exited',
      running: false,
    });
  });

  it('restarts, inspects, and explicitly removes containers', async () => {
    const service = new ContainerService(docker);

    await expect(service.restartContainer(containerId, 8080)).resolves.toEqual({
      containerId,
      status: 'running',
      running: true,
      hostPort: 49_153,
    });
    await expect(service.inspectStatus(containerId)).resolves.toEqual({
      containerId,
      status: 'running',
      running: true,
    });
    await expect(service.removeContainer(containerId)).resolves.toBeUndefined();
    expect(container.restart).toHaveBeenCalledOnce();
    expect(container.remove).toHaveBeenCalledWith({ force: true });
  });

  it('retrieves combined stdout and stderr logs', async () => {
    container.logs.mockResolvedValue(
      Buffer.concat([
        createLogFrame(1, 'standard output\n'),
        createLogFrame(2, 'standard error\n'),
      ]),
    );
    const service = new ContainerService(docker);

    await expect(
      service.getLogs(containerId, { tail: 250, timestamps: true }),
    ).resolves.toBe('standard output\nstandard error\n');
    expect(container.logs).toHaveBeenCalledWith({
      stdout: true,
      stderr: true,
      follow: false,
      timestamps: true,
      tail: 250,
    });
  });

  it('uses a bounded default tail and caps the log response size', async () => {
    container.logs.mockResolvedValue('x'.repeat(2 * 1024 * 1024));
    const service = new ContainerService(docker);

    const logs = await service.getLogs(containerId);

    expect(container.logs).toHaveBeenCalledWith({
      stdout: true,
      stderr: true,
      follow: false,
      timestamps: false,
      tail: 1_000,
    });
    expect(Buffer.byteLength(logs, 'utf8')).toBeLessThanOrEqual(1024 * 1024);
    expect(logs).toMatch(/^\[Earlier log output truncated\]/);
  });

  it('rejects an excessive log tail', async () => {
    const service = new ContainerService(docker);

    await expect(
      service.getLogs(containerId, { tail: 10_001 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(container.logs).not.toHaveBeenCalled();
  });

  it('calculates current CPU and memory statistics', async () => {
    const service = new ContainerService(docker);

    await expect(service.getCpuStatistics(containerId)).resolves.toEqual({
      usagePercent: 80,
      totalUsage: 300,
      systemUsage: 2_000,
      onlineCpus: 4,
    });
    await expect(service.getMemoryStatistics(containerId)).resolves.toEqual({
      usageBytes: 256,
      limitBytes: 1_024,
      usagePercent: 25,
    });
    expect(container.stats).toHaveBeenCalledWith({ stream: false });
  });

  it('calculates running and stopped uptime from Docker timestamps', async () => {
    const now = Date.parse('2026-09-04T00:02:00.500Z');
    const service = new ContainerService(docker, () => now);

    await expect(service.getUptime(containerId)).resolves.toEqual({
      startedAt,
      uptimeSeconds: 120,
    });

    container.inspect.mockResolvedValue(stoppedInspectResult);
    await expect(service.getUptime(containerId)).resolves.toEqual({
      startedAt,
      uptimeSeconds: 90,
    });
  });

  it('validates startup input before calling Docker', async () => {
    const service = new ContainerService(docker);

    await expect(
      service.startContainer({
        imageIdentifier: 'deployflow/example:latest',
        containerPort: 0,
        deploymentId,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.startContainer({
        imageIdentifier: 'deployflow/example image:latest',
        containerPort: 8080,
        deploymentId,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Image identifier is invalid',
    });
    expect(docker.createContainer).not.toHaveBeenCalled();
  });

  it('maps Docker not-found failures to structured 404 errors', async () => {
    container.inspect.mockRejectedValue({ statusCode: 404 });
    const service = new ContainerService(docker);

    await expect(service.inspectStatus(containerId)).rejects.toMatchObject({
      name: 'AppError',
      statusCode: 404,
      message: 'Unable to inspect container status',
    });
  });
});
