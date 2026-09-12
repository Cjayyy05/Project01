import { createHmac } from 'node:crypto';

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({
  projectFindFirst: vi.fn<(options: unknown) => Promise<unknown>>(),
  projectFindUnique: vi.fn<(options: unknown) => Promise<unknown>>(),
  deliveryCreateMany: vi.fn<
    (options: unknown) => Promise<{ count: number }>
  >(),
}));

const deploymentMocks = vi.hoisted(() => ({
  deployProjectReplacingRunning: vi.fn<
    (projectId: unknown, onEvent?: unknown) => Promise<unknown>
  >(),
}));

const realtimeMocks = vi.hoisted(() => ({
  broadcastDeploymentEvent: vi.fn(),
}));

vi.mock('../src/config/database.js', () => ({
  database: {
    project: {
      findFirst: databaseMocks.projectFindFirst,
      findUnique: databaseMocks.projectFindUnique,
    },
    gitHubWebhookDelivery: {
      createMany: databaseMocks.deliveryCreateMany,
    },
  },
}));

vi.mock('../src/services/deployment.service.js', () => ({
  deploymentService: {
    deployProjectReplacingRunning:
      deploymentMocks.deployProjectReplacingRunning,
  },
}));

vi.mock('../src/realtime/deployment-socket.js', () => ({
  broadcastDeploymentEvent: realtimeMocks.broadcastDeploymentEvent,
}));

import { createApp } from '../src/app.js';
import { createAccessToken } from '../src/services/token.service.js';

const secretKey = 'test-only-github-webhook-key-never-used-in-production';
const userId = '352bd66d-41b7-4c0d-a148-8a236647677b';
const projectId = 'a382fb3d-dce4-4470-8e41-89a181466ce8';
const deliveryId = 'd382fb3d-dce4-4470-8e41-89a181466ce8';
const project = {
  id: projectId,
  repositoryUrl: 'https://github.com/example/example-api',
  branch: 'main',
};

const createProjectSecret = (): string =>
  createHmac('sha256', secretKey)
    .update(`github-webhook:${projectId}`, 'utf8')
    .digest('base64url');

const createSignature = (body: string): string =>
  `sha256=${createHmac('sha256', createProjectSecret()).update(body).digest('hex')}`;

const createPayload = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    ref: 'refs/heads/main',
    repository: { full_name: 'example/example-api' },
    ...overrides,
  });

const sendWebhook = (
  body: string,
  options: { signature?: string; delivery?: string; event?: string } = {},
) => {
  const pendingRequest = request(createApp())
    .post(`/api/webhooks/github/${projectId}`)
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', options.event ?? 'push')
    .set('X-GitHub-Delivery', options.delivery ?? deliveryId);

  if (options.signature !== undefined) {
    pendingRequest.set('X-Hub-Signature-256', options.signature);
  }

  return pendingRequest.send(body);
};

let authorization: string;

beforeAll(async () => {
  authorization = `Bearer ${await createAccessToken(userId)}`;
});

beforeEach(() => {
  vi.clearAllMocks();
  databaseMocks.projectFindFirst.mockResolvedValue(project);
  databaseMocks.projectFindUnique.mockResolvedValue(project);
  databaseMocks.deliveryCreateMany.mockResolvedValue({ count: 1 });
  deploymentMocks.deployProjectReplacingRunning.mockResolvedValue({
    id: 'e382fb3d-dce4-4470-8e41-89a181466ce8',
  });
});

describe('GitHub webhook endpoint', () => {
  it('accepts a valid signature for the matching repository and branch and triggers a new deployment', async () => {
    const body = createPayload();
    const response = await sendWebhook(body, {
      signature: createSignature(body),
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: true });
    expect(databaseMocks.deliveryCreateMany).toHaveBeenCalledWith({
      data: { deliveryId, projectId },
      skipDuplicates: true,
    });
    expect(
      deploymentMocks.deployProjectReplacingRunning,
    ).toHaveBeenCalledWith(projectId, realtimeMocks.broadcastDeploymentEvent);
  });

  it('rejects an invalid signature', async () => {
    const response = await sendWebhook(createPayload(), {
      signature: `sha256=${'0'.repeat(64)}`,
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { message: 'Invalid GitHub webhook signature' },
    });
    expect(databaseMocks.deliveryCreateMany).not.toHaveBeenCalled();
    expect(
      deploymentMocks.deployProjectReplacingRunning,
    ).not.toHaveBeenCalled();
  });

  it('rejects a missing signature', async () => {
    const response = await sendWebhook(createPayload());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { message: 'Invalid GitHub webhook signature' },
    });
  });

  it('ignores a valid delivery for an unrelated repository', async () => {
    const body = createPayload({
      repository: { full_name: 'another-owner/another-repository' },
    });
    const response = await sendWebhook(body, {
      signature: createSignature(body),
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      accepted: false,
      reason: 'ignored_repository',
    });
    expect(databaseMocks.deliveryCreateMany).not.toHaveBeenCalled();
    expect(
      deploymentMocks.deployProjectReplacingRunning,
    ).not.toHaveBeenCalled();
  });

  it('ignores a valid delivery for the wrong branch', async () => {
    const body = createPayload({ ref: 'refs/heads/feature/not-main' });
    const response = await sendWebhook(body, {
      signature: createSignature(body),
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      accepted: false,
      reason: 'ignored_branch',
    });
    expect(databaseMocks.deliveryCreateMany).not.toHaveBeenCalled();
    expect(
      deploymentMocks.deployProjectReplacingRunning,
    ).not.toHaveBeenCalled();
  });

  it('processes a repeated delivery ID only once', async () => {
    databaseMocks.deliveryCreateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const body = createPayload();
    const signature = createSignature(body);

    const firstResponse = await sendWebhook(body, { signature });
    const duplicateResponse = await sendWebhook(body, { signature });

    expect(firstResponse.body).toEqual({ accepted: true });
    expect(duplicateResponse.body).toEqual({
      accepted: false,
      reason: 'duplicate_delivery',
    });
    expect(
      deploymentMocks.deployProjectReplacingRunning,
    ).toHaveBeenCalledOnce();
  });
});

describe('GitHub webhook configuration endpoint', () => {
  it('returns the stable per-project secret only to the project owner', async () => {
    const response = await request(createApp())
      .get(`/api/projects/${projectId}/webhook`)
      .set('Authorization', authorization);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      webhook: {
        url: `http://localhost:4000/api/webhooks/github/${projectId}`,
        secret: createProjectSecret(),
        contentType: 'application/json',
        event: 'push',
      },
    });
    expect(databaseMocks.projectFindFirst).toHaveBeenCalledWith({
      where: { id: projectId, userId },
      select: { id: true, repositoryUrl: true, branch: true },
    });
  });

  it("does not expose another user's webhook secret", async () => {
    databaseMocks.projectFindFirst.mockResolvedValue(null);

    const response = await request(createApp())
      .get(`/api/projects/${projectId}/webhook`)
      .set('Authorization', authorization);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { message: 'Project not found' },
    });
  });

  it('requires REST authentication before returning webhook details', async () => {
    const response = await request(createApp()).get(
      `/api/projects/${projectId}/webhook`,
    );

    expect(response.status).toBe(401);
    expect(databaseMocks.projectFindFirst).not.toHaveBeenCalled();
  });
});
