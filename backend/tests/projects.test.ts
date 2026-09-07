import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({
  create: vi.fn<(args: unknown) => Promise<unknown>>(),
  deleteMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(),
  findFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  findMany: vi.fn<(args: unknown) => Promise<unknown[]>>(),
}));

vi.mock('../src/config/database.js', () => ({
  database: {
    project: databaseMocks,
  },
}));

import { createApp } from '../src/app.js';
import { createAccessToken } from '../src/services/token.service.js';

const userId = '352bd66d-41b7-4c0d-a148-8a236647677b';
const projectId = 'a382fb3d-dce4-4470-8e41-89a181466ce8';
const now = new Date('2026-09-03T00:00:00.000Z');
const project = {
  id: projectId,
  userId,
  name: 'Example API',
  repositoryUrl: 'https://github.com/example/example-api',
  branch: 'main',
  containerPort: 3000,
  createdAt: now,
  updatedAt: now,
};

let authorization: string;

beforeAll(async () => {
  authorization = `Bearer ${await createAccessToken(userId)}`;
});

beforeEach(() => {
  databaseMocks.create.mockReset();
  databaseMocks.deleteMany.mockReset();
  databaseMocks.findFirst.mockReset();
  databaseMocks.findMany.mockReset();
});

describe('POST /api/projects', () => {
  it('creates an owned project and defaults the branch to main', async () => {
    databaseMocks.create.mockResolvedValue(project);

    const response = await request(createApp())
      .post('/api/projects')
      .set('Authorization', authorization)
      .send({
        name: ' Example API ',
        repositoryUrl: 'https://github.com/example/example-api',
        containerPort: 3000,
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      project: {
        ...project,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
    const createArgs = databaseMocks.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
      select: unknown;
    };
    expect(createArgs.data).toEqual({
      userId,
      name: 'Example API',
      repositoryUrl: 'https://github.com/example/example-api',
      branch: 'main',
      containerPort: 3000,
    });
    expect(createArgs.select).toBeDefined();
  });

  it('rejects a non-GitHub repository URL', async () => {
    const response = await request(createApp())
      .post('/api/projects')
      .set('Authorization', authorization)
      .send({
        name: 'Example API',
        repositoryUrl: 'https://gitlab.com/example/example-api',
        containerPort: 3000,
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { message: 'A valid public GitHub HTTPS URL is required' },
    });
    expect(databaseMocks.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid container port', async () => {
    const response = await request(createApp())
      .post('/api/projects')
      .set('Authorization', authorization)
      .send({
        name: 'Example API',
        repositoryUrl: 'https://github.com/example/example-api',
        containerPort: 70_000,
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        message: 'Container port must be an integer from 1 to 65535',
      },
    });
    expect(databaseMocks.create).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated access', async () => {
    const response = await request(createApp()).post('/api/projects').send({
      name: 'Example API',
      repositoryUrl: 'https://github.com/example/example-api',
      containerPort: 3000,
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { message: 'Authentication required' },
    });
    expect(databaseMocks.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/projects', () => {
  it('lists only projects belonging to the authenticated user', async () => {
    databaseMocks.findMany.mockResolvedValue([project]);

    const response = await request(createApp())
      .get('/api/projects')
      .set('Authorization', authorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      projects: [
        {
          ...project,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
    });
    const listArgs = databaseMocks.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(listArgs.where).toEqual({ userId });
  });
});

describe('GET /api/projects/:id', () => {
  it('returns an owned project', async () => {
    databaseMocks.findFirst.mockResolvedValue(project);

    const response = await request(createApp())
      .get(`/api/projects/${projectId}`)
      .set('Authorization', authorization);

    expect(response.status).toBe(200);
    const getArgs = databaseMocks.findFirst.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(getArgs.where).toEqual({ id: projectId, userId });
  });

  it("does not expose another user's project", async () => {
    databaseMocks.findFirst.mockResolvedValue(null);

    const response = await request(createApp())
      .get(`/api/projects/${projectId}`)
      .set('Authorization', authorization);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { message: 'Project not found' },
    });
    const getArgs = databaseMocks.findFirst.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(getArgs.where).toEqual({ id: projectId, userId });
  });
});

describe('DELETE /api/projects/:id', () => {
  it('deletes an owned project', async () => {
    databaseMocks.deleteMany.mockResolvedValue({ count: 1 });

    const response = await request(createApp())
      .delete(`/api/projects/${projectId}`)
      .set('Authorization', authorization);

    expect(response.status).toBe(204);
    expect(databaseMocks.deleteMany).toHaveBeenCalledWith({
      where: { id: projectId, userId },
    });
  });

  it("does not delete another user's project", async () => {
    databaseMocks.deleteMany.mockResolvedValue({ count: 0 });

    const response = await request(createApp())
      .delete(`/api/projects/${projectId}`)
      .set('Authorization', authorization);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { message: 'Project not found' },
    });
    expect(databaseMocks.deleteMany).toHaveBeenCalledWith({
      where: { id: projectId, userId },
    });
  });
});
