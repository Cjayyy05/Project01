import { createHmac, timingSafeEqual } from 'node:crypto';

import { database } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';
import { parseGitHubRepositoryUrl } from '../utils/github-repository.js';
import { parseProjectId } from '../utils/project-validation.js';

const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i;
const DELIVERY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const PUSH_EVENT = 'push';

type WebhookProject = {
  id: string;
  repositoryUrl: string;
  branch: string;
};

type GitHubWebhookDatabase = {
  project: {
    findFirst: (options: {
      where: { id: string; userId: string };
      select: { id: true; repositoryUrl: true; branch: true };
    }) => Promise<WebhookProject | null>;
    findUnique: (options: {
      where: { id: string };
      select: { id: true; repositoryUrl: true; branch: true };
    }) => Promise<WebhookProject | null>;
  };
  gitHubWebhookDelivery: {
    createMany: (options: {
      data: { deliveryId: string; projectId: string };
      skipDuplicates: true;
    }) => Promise<{ count: number }>;
  };
};

export type GitHubWebhookConfiguration = {
  url: string;
  secret: string;
  contentType: 'application/json';
  event: 'push';
};

export type GitHubWebhookInput = {
  projectId: unknown;
  signature: unknown;
  event: unknown;
  deliveryId: unknown;
  rawBody: unknown;
};

export type GitHubWebhookResult =
  | { accepted: true }
  | {
      accepted: false;
      reason:
        | 'duplicate_delivery'
        | 'ignored_branch'
        | 'ignored_event'
        | 'ignored_repository';
    };

export type GitHubWebhookDependencies = {
  database?: GitHubWebhookDatabase;
  secretKey?: string;
  publicBaseUrl?: string;
};

export type GitHubDeploymentTrigger = (projectId: string) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRequiredHeader = (
  name: string,
  value: unknown,
  pattern?: RegExp,
): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    (pattern !== undefined && !pattern.test(value))
  ) {
    throw new AppError(400, `${name} header is required or invalid`);
  }

  return value;
};

const readSignature = (value: unknown): string => {
  if (typeof value !== 'string' || !SIGNATURE_PATTERN.test(value)) {
    throw new AppError(401, 'Invalid GitHub webhook signature');
  }

  return value;
};

const parsePayload = (rawBody: Buffer): Record<string, unknown> => {
  try {
    const payload: unknown = JSON.parse(rawBody.toString('utf8'));
    if (!isRecord(payload)) throw new Error('Payload must be an object');
    return payload;
  } catch {
    throw new AppError(400, 'GitHub webhook payload is invalid');
  }
};

const readRepositoryFullName = (payload: Record<string, unknown>): string => {
  const repository = payload.repository;
  const fullName = isRecord(repository) ? repository.full_name : undefined;

  return typeof fullName === 'string' ? fullName : '';
};

const readRef = (payload: Record<string, unknown>): string =>
  typeof payload.ref === 'string' ? payload.ref : '';

export class GitHubWebhookService {
  readonly #database: GitHubWebhookDatabase;
  readonly #secretKey: string | undefined;
  readonly #publicBaseUrl: string;

  public constructor(dependencies: GitHubWebhookDependencies = {}) {
    this.#database = dependencies.database ?? database;
    this.#secretKey = dependencies.secretKey ?? env.githubWebhookSecretKey;
    this.#publicBaseUrl = dependencies.publicBaseUrl ?? env.publicBaseUrl;
  }

  public async getConfiguration(
    userId: string,
    rawProjectId: unknown,
  ): Promise<GitHubWebhookConfiguration> {
    const projectId = parseProjectId(rawProjectId);
    let project: WebhookProject | null;

    try {
      project = await this.#database.project.findFirst({
        where: { id: projectId, userId },
        select: { id: true, repositoryUrl: true, branch: true },
      });
    } catch {
      throw new AppError(500, 'Unable to load GitHub webhook configuration');
    }

    if (project === null) throw new AppError(404, 'Project not found');

    return {
      url: `${this.#publicBaseUrl}/api/webhooks/github/${project.id}`,
      secret: this.#createProjectSecret(project.id),
      contentType: 'application/json',
      event: PUSH_EVENT,
    };
  }

  public async process(
    input: GitHubWebhookInput,
    triggerDeployment: GitHubDeploymentTrigger,
  ): Promise<GitHubWebhookResult> {
    const projectId = parseProjectId(input.projectId);
    const signature = readSignature(input.signature);

    if (!Buffer.isBuffer(input.rawBody)) {
      throw new AppError(400, 'GitHub webhook body must be JSON');
    }

    const project = await this.#getProject(projectId);
    this.#verifySignature(project.id, input.rawBody, signature);

    const event = readRequiredHeader('X-GitHub-Event', input.event);
    const deliveryId = readRequiredHeader(
      'X-GitHub-Delivery',
      input.deliveryId,
      DELIVERY_ID_PATTERN,
    );

    if (event !== PUSH_EVENT) {
      return { accepted: false, reason: 'ignored_event' };
    }

    const payload = parsePayload(input.rawBody);
    const configuredRepository = parseGitHubRepositoryUrl(
      project.repositoryUrl,
    );
    const expectedFullName =
      `${configuredRepository.owner}/${configuredRepository.name}`.toLowerCase();

    if (readRepositoryFullName(payload).toLowerCase() !== expectedFullName) {
      return { accepted: false, reason: 'ignored_repository' };
    }

    if (readRef(payload) !== `refs/heads/${project.branch}`) {
      return { accepted: false, reason: 'ignored_branch' };
    }

    let deliveryCreated: { count: number };

    try {
      deliveryCreated = await this.#database.gitHubWebhookDelivery.createMany({
        data: { deliveryId, projectId: project.id },
        skipDuplicates: true,
      });
    } catch {
      throw new AppError(500, 'Unable to process GitHub webhook');
    }

    if (deliveryCreated.count === 0) {
      return { accepted: false, reason: 'duplicate_delivery' };
    }

    triggerDeployment(project.id);
    return { accepted: true };
  }

  async #getProject(projectId: string): Promise<WebhookProject> {
    let project: WebhookProject | null;

    try {
      project = await this.#database.project.findUnique({
        where: { id: projectId },
        select: { id: true, repositoryUrl: true, branch: true },
      });
    } catch {
      throw new AppError(500, 'Unable to process GitHub webhook');
    }

    if (project === null) throw new AppError(404, 'Webhook not found');
    return project;
  }

  #createProjectSecret(projectId: string): string {
    if (this.#secretKey === undefined) {
      throw new AppError(503, 'GitHub webhooks are not configured');
    }

    return createHmac('sha256', this.#secretKey)
      .update(`github-webhook:${projectId}`, 'utf8')
      .digest('base64url');
  }

  #verifySignature(projectId: string, body: Buffer, signature: string): void {
    const expected = createHmac('sha256', this.#createProjectSecret(projectId))
      .update(body)
      .digest();
    const signatureMatch = SIGNATURE_PATTERN.exec(signature);
    const received = Buffer.from(signatureMatch?.[1] ?? '', 'hex');

    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new AppError(401, 'Invalid GitHub webhook signature');
    }
  }
}

export const githubWebhookService = new GitHubWebhookService();
