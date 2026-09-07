import type { Server as HttpServer } from 'node:http';

import {
  Server,
  type Socket,
} from 'socket.io';

import { AppError } from '../utils/app-error.js';
import {
  deploymentService,
  type DeploymentEvent,
  type DeploymentRecord,
} from '../services/deployment.service.js';
import { verifyAccessToken } from '../services/token.service.js';

const BEARER_TOKEN_PATTERN = /^Bearer\s+(\S+)$/i;
const DEPLOYMENT_ROOM_PREFIX = 'deployment:';

export type SubscriptionResult =
  | { ok: true; room: string }
  | { ok: false; error: string };

export type ClientToServerEvents = {
  'deployment:subscribe': (
    payload: unknown,
    acknowledge?: (result: SubscriptionResult) => void,
  ) => void;
};

export type ServerToClientEvents = {
  'deployment:status': (payload: {
    deploymentId: string;
    status: string;
  }) => void;
  'deployment:log': (payload: {
    deploymentId: string;
    source: 'deployment' | 'build';
    message: string;
  }) => void;
  'deployment:complete': (payload: {
    deployment: DeploymentRecord;
  }) => void;
  'deployment:error': (payload: {
    deployment: DeploymentRecord;
    errorMessage: string;
  }) => void;
};

type SocketData = { userId: string };
type InterServerEvents = Record<string, never>;
type DeploymentSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type DeploymentSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type DeploymentSocketDependencies = {
  verifyToken?: (token: string) => Promise<string>;
  getDeploymentForUser?: (
    userId: string,
    deploymentId: unknown,
  ) => Promise<DeploymentRecord>;
};

const getToken = (
  handshake: DeploymentSocket['handshake'],
): string | undefined => {
  const authentication = handshake.auth as unknown;
  const authToken = isRecord(authentication)
    ? authentication.token
    : undefined;

  if (typeof authToken === 'string' && authToken.length > 0) {
    return BEARER_TOKEN_PATTERN.exec(authToken)?.[1] ?? authToken;
  }

  const authorization = handshake.headers.authorization;
  return typeof authorization === 'string'
    ? BEARER_TOKEN_PATTERN.exec(authorization)?.[1]
    : undefined;
};

const getDeploymentId = (payload: unknown): unknown => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return undefined;
  }

  return 'deploymentId' in payload ? payload.deploymentId : undefined;
};

const getSubscriptionError = (error: unknown): string =>
  error instanceof AppError ? error.message : 'Unable to subscribe to deployment';

export class DeploymentSocketGateway {
  readonly #io: DeploymentSocketServer;
  readonly #verifyToken: (token: string) => Promise<string>;
  readonly #getDeploymentForUser: (
    userId: string,
    deploymentId: unknown,
  ) => Promise<DeploymentRecord>;

  public constructor(
    io: DeploymentSocketServer,
    dependencies: DeploymentSocketDependencies = {},
  ) {
    this.#io = io;
    this.#verifyToken = dependencies.verifyToken ?? verifyAccessToken;
    this.#getDeploymentForUser =
      dependencies.getDeploymentForUser ??
      deploymentService.getDeploymentForUser.bind(deploymentService);
  }

  public register(): void {
    this.#io.use((socket, next) => {
      void this.#authenticate(socket, next);
    });

    this.#io.on('connection', (socket) => {
      socket.on('deployment:subscribe', (payload, acknowledge) => {
        void this.#subscribe(socket, getDeploymentId(payload), acknowledge);
      });
    });
  }

  async #authenticate(
    socket: DeploymentSocket,
    next: (error?: Error) => void,
  ): Promise<void> {
    const token = getToken(socket.handshake);

    if (token === undefined) {
      next(new Error('Authentication required'));
      return;
    }

    try {
      socket.data.userId = await this.#verifyToken(token);
      next();
    } catch {
      next(new Error('Authentication required'));
    }
  }

  public broadcast(event: DeploymentEvent): void {
    const deploymentId =
      event.type === 'completed' || event.type === 'failed'
        ? event.deployment.id
        : event.deploymentId;
    const room = `${DEPLOYMENT_ROOM_PREFIX}${deploymentId}`;

    switch (event.type) {
      case 'status':
        this.#io.to(room).emit('deployment:status', {
          deploymentId,
          status: event.status,
        });
        break;
      case 'log':
        this.#io.to(room).emit('deployment:log', {
          deploymentId,
          source: event.source,
          message: event.message,
        });
        break;
      case 'completed':
        this.#io.to(room).emit('deployment:complete', {
          deployment: event.deployment,
        });
        break;
      case 'failed':
        this.#io.to(room).emit('deployment:error', {
          deployment: event.deployment,
          errorMessage: event.errorMessage,
        });
        break;
    }
  }

  async #subscribe(
    socket: DeploymentSocket,
    deploymentId: unknown,
    acknowledge: ((result: SubscriptionResult) => void) | undefined,
  ): Promise<void> {
    try {
      const deployment = await this.#getDeploymentForUser(
        socket.data.userId,
        deploymentId,
      );
      const room = `${DEPLOYMENT_ROOM_PREFIX}${deployment.id}`;
      await socket.join(room);
      acknowledge?.({ ok: true, room });
    } catch (error: unknown) {
      acknowledge?.({ ok: false, error: getSubscriptionError(error) });
    }
  }
}

let activeGateway: DeploymentSocketGateway | undefined;

export const attachDeploymentSocket = (
  httpServer: HttpServer,
  dependencies: DeploymentSocketDependencies = {},
): DeploymentSocketServer => {
  const io: DeploymentSocketServer = new Server(httpServer);
  activeGateway = new DeploymentSocketGateway(io, dependencies);
  activeGateway.register();
  return io;
};

export const broadcastDeploymentEvent = (event: DeploymentEvent): void => {
  activeGateway?.broadcast(event);
};
