import { request } from 'node:http';

import { AppError } from '../utils/app-error.js';
import { parseHealthCheckPath } from '../utils/health-check-path.js';

const DEFAULT_MAX_ATTEMPTS = 20;
const DEFAULT_REQUEST_TIMEOUT_MS = 2_000;
const DEFAULT_RETRY_DELAY_MS = 1_000;

export type ApplicationHealthCheckInput = {
  hostPort: number;
  path: string;
};

export type LocalHealthRequest = (input: {
  hostPort: number;
  path: string;
  timeoutMs: number;
}) => Promise<number>;

type ApplicationHealthCheckDependencies = {
  requestHealth?: LocalHealthRequest;
  sleep?: (milliseconds: number) => Promise<void>;
  maxAttempts?: number;
  requestTimeoutMs?: number;
  retryDelayMs?: number;
};

const requestLocalHealth: LocalHealthRequest = ({
  hostPort,
  path,
  timeoutMs,
}) =>
  new Promise((resolve, reject) => {
    const healthRequest = request(
      {
        hostname: '127.0.0.1',
        port: hostPort,
        path,
        method: 'GET',
        headers: { Accept: '*/*', 'User-Agent': 'DeployFlow-HealthCheck/1.0' },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );

    healthRequest.setTimeout(timeoutMs, () => {
      healthRequest.destroy(new Error('Health-check request timed out'));
    });
    healthRequest.on('error', reject);
    healthRequest.end();
  });

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const parseHostPort = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new AppError(400, 'Health-check host port is invalid');
  }
  return value;
};

export class ApplicationHealthCheckService {
  readonly #requestHealth: LocalHealthRequest;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #maxAttempts: number;
  readonly #requestTimeoutMs: number;
  readonly #retryDelayMs: number;

  public constructor(dependencies: ApplicationHealthCheckDependencies = {}) {
    this.#requestHealth = dependencies.requestHealth ?? requestLocalHealth;
    this.#sleep = dependencies.sleep ?? sleep;
    this.#maxAttempts = dependencies.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.#requestTimeoutMs =
      dependencies.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#retryDelayMs =
      dependencies.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  public async waitUntilHealthy(
    input: ApplicationHealthCheckInput,
  ): Promise<void> {
    const hostPort = parseHostPort(input.hostPort);
    const path = parseHealthCheckPath(input.path);

    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      try {
        const statusCode = await this.#requestHealth({
          hostPort,
          path,
          timeoutMs: this.#requestTimeoutMs,
        });
        if (statusCode >= 200 && statusCode < 400) return;
      } catch {
        // Connection failures and request timeouts are retried within the bound.
      }

      if (attempt < this.#maxAttempts) {
        await this.#sleep(this.#retryDelayMs);
      }
    }

    throw new AppError(
      422,
      `Application did not become healthy at ${path}`,
    );
  }
}

export const applicationHealthCheckService =
  new ApplicationHealthCheckService();
