import { createServer, type Server as HttpServer } from 'node:http';

import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeploymentStatus } from '../src/generated/prisma/enums.js';
import {
  attachDeploymentSocket,
  broadcastDeploymentEvent,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SubscriptionResult,
} from '../src/realtime/deployment-socket.js';
import type { DeploymentRecord } from '../src/services/deployment.service.js';
import { createAccessToken } from '../src/services/token.service.js';
import { AppError } from '../src/utils/app-error.js';

const userId = '352bd66d-41b7-4c0d-a148-8a236647677b';
const deploymentId = 'b382fb3d-dce4-4470-8e41-89a181466ce8';
const room = `deployment:${deploymentId}`;
const now = new Date('2026-09-04T04:00:00.000Z');
const deployment: DeploymentRecord = {
  id: deploymentId,
  projectId: 'a382fb3d-dce4-4470-8e41-89a181466ce8',
  rollbackSourceDeploymentId: null,
  applicationType: 'DOCKERFILE',
  commitHash: 'a'.repeat(40),
  status: DeploymentStatus.RUNNING,
  containerId: 'b'.repeat(64),
  imageId: `sha256:${'c'.repeat(64)}`,
  imageTag: 'deployflow/example:latest',
  hostPort: 49_153,
  errorMessage: null,
  startedAt: now,
  finishedAt: null,
  createdAt: now,
  updatedAt: now,
};

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

let token: string;

beforeAll(async () => {
  token = await createAccessToken(userId);
});

describe('deployment Socket.IO gateway', () => {
  let httpServer: HttpServer;
  let socketServer: ReturnType<typeof attachDeploymentSocket>;
  let serverUrl: string;
  let clients: TestClient[];
  let getDeploymentForUser: ReturnType<
    typeof vi.fn<
      (user: string, requestedDeploymentId: unknown) => Promise<DeploymentRecord>
    >
  >;

  beforeEach(async () => {
    clients = [];
    getDeploymentForUser = vi.fn().mockResolvedValue(deployment);
    httpServer = createServer();
    socketServer = attachDeploymentSocket(httpServer, { getDeploymentForUser });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address();

    if (address === null || typeof address === 'string') {
      throw new Error('Test Socket.IO server did not bind to a TCP port');
    }

    serverUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  afterEach(async () => {
    for (const client of clients) client.disconnect();

    await new Promise<void>((resolve) => {
      void socketServer.close(() => {
        resolve();
      });
    });
  });

  const connect = (authToken: string | undefined): Promise<TestClient> => {
    const client: TestClient = createClient(serverUrl, {
      ...(authToken === undefined ? {} : { auth: { token: authToken } }),
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    clients.push(client);

    return new Promise((resolve, reject) => {
      client.once('connect', () => {
        resolve(client);
      });
      client.once('connect_error', reject);
    });
  };

  const subscribe = (client: TestClient, id: unknown) =>
    new Promise<SubscriptionResult>((resolve) => {
      client.emit('deployment:subscribe', { deploymentId: id }, resolve);
    });

  it('rejects Socket.IO connections without a valid access token', async () => {
    await expect(connect(undefined)).rejects.toMatchObject({
      message: 'Authentication required',
    });
    await expect(connect('not-a-valid-token')).rejects.toMatchObject({
      message: 'Authentication required',
    });
    expect(getDeploymentForUser).not.toHaveBeenCalled();
  });

  it('authorizes and joins an owned deployment room', async () => {
    const client = await connect(token);

    await expect(subscribe(client, deploymentId)).resolves.toEqual({
      ok: true,
      room,
    });
    expect(getDeploymentForUser).toHaveBeenCalledWith(userId, deploymentId);
  });

  it('rejects invalid and unauthorized deployment subscriptions', async () => {
    const client = await connect(token);

    getDeploymentForUser.mockRejectedValueOnce(
      new AppError(400, 'Deployment ID must be a valid UUID'),
    );
    await expect(subscribe(client, 'invalid')).resolves.toEqual({
      ok: false,
      error: 'Deployment ID must be a valid UUID',
    });

    getDeploymentForUser.mockRejectedValueOnce(
      new AppError(404, 'Deployment not found'),
    );
    await expect(subscribe(client, deploymentId)).resolves.toEqual({
      ok: false,
      error: 'Deployment not found',
    });
  });

  it('broadcasts deployment callback events only to the deployment room', async () => {
    const subscribedClient = await connect(token);
    const otherClient = await connect(token);
    await subscribe(subscribedClient, deploymentId);
    const unexpectedStatus = vi.fn();
    otherClient.on('deployment:status', unexpectedStatus);

    const status = new Promise<{ deploymentId: string; status: string }>(
      (resolve) => subscribedClient.once('deployment:status', resolve),
    );
    broadcastDeploymentEvent({
      type: 'status',
      deploymentId,
      status: DeploymentStatus.BUILDING,
    });
    await expect(status).resolves.toEqual({
      deploymentId,
      status: DeploymentStatus.BUILDING,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(unexpectedStatus).not.toHaveBeenCalled();

    const log = new Promise<{
      deploymentId: string;
      source: 'deployment' | 'build';
      message: string;
    }>((resolve) => subscribedClient.once('deployment:log', resolve));
    broadcastDeploymentEvent({
      type: 'log',
      deploymentId,
      source: 'build',
      message: 'Building image',
    });
    await expect(log).resolves.toEqual({
      deploymentId,
      source: 'build',
      message: 'Building image',
    });

    const complete = new Promise<{ deployment: DeploymentRecord }>((resolve) =>
      subscribedClient.once('deployment:complete', resolve),
    );
    broadcastDeploymentEvent({ type: 'completed', deployment });
    await expect(complete).resolves.toEqual({
      deployment: {
        ...deployment,
        startedAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });

    const failure = new Promise<{
      deployment: DeploymentRecord;
      errorMessage: string;
    }>((resolve) => subscribedClient.once('deployment:error', resolve));
    broadcastDeploymentEvent({
      type: 'failed',
      deployment: { ...deployment, status: DeploymentStatus.FAILED },
      errorMessage: 'Docker image build failed',
    });
    await expect(failure).resolves.toMatchObject({
      deployment: { id: deploymentId, status: DeploymentStatus.FAILED },
      errorMessage: 'Docker image build failed',
    });
  });

  it('clears rooms on disconnect and reauthenticates on reconnect', async () => {
    const client = await connect(token);
    await subscribe(client, deploymentId);
    expect(getDeploymentForUser).toHaveBeenCalledTimes(1);
    expect(socketServer.sockets.adapter.rooms.has(room)).toBe(true);

    const connectedSocket = [...socketServer.sockets.sockets.values()][0];

    if (connectedSocket === undefined) {
      throw new Error('Socket.IO server did not retain the connected client');
    }

    const disconnected = new Promise<void>((resolve) => {
      connectedSocket.once('disconnect', () => {
        resolve();
      });
    });

    client.disconnect();
    await disconnected;
    expect(socketServer.sockets.adapter.rooms.has(room)).toBe(false);

    const reconnected = new Promise<void>((resolve) => {
      client.once('connect', () => {
        resolve();
      });
    });
    client.connect();
    await reconnected;

    await expect(subscribe(client, deploymentId)).resolves.toEqual({
      ok: true,
      room,
    });
    expect(getDeploymentForUser).toHaveBeenCalledTimes(2);
  });
});
