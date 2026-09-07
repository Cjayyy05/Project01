import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({
  create: vi.fn<(args: unknown) => Promise<unknown>>(),
  findUnique: vi.fn<(args: unknown) => Promise<unknown>>(),
}));

vi.mock('../src/config/database.js', () => ({
  database: {
    user: databaseMocks,
  },
}));

import { createApp } from '../src/app.js';
import { createAccessToken } from '../src/services/token.service.js';
import { hashPassword } from '../src/utils/password.js';

const now = new Date('2026-09-03T00:00:00.000Z');
const user = {
  id: '352bd66d-41b7-4c0d-a148-8a236647677b',
  email: 'user@example.com',
  createdAt: now,
  updatedAt: now,
};

beforeEach(() => {
  databaseMocks.create.mockReset();
  databaseMocks.findUnique.mockReset();
});

describe('POST /api/auth/register', () => {
  it('registers a user and never returns the password hash', async () => {
    databaseMocks.findUnique.mockResolvedValue(null);
    databaseMocks.create.mockResolvedValue(user);

    const response = await request(createApp()).post('/api/auth/register').send({
      email: '  USER@example.com ',
      password: 'Secure123',
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      user: {
        ...user,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
    expect(response.body).not.toHaveProperty('user.passwordHash');

    const createCall = databaseMocks.create.mock.calls[0]?.[0] as {
      data: { email: string; passwordHash: string };
    };
    expect(createCall.data.email).toBe('user@example.com');
    expect(createCall.data.passwordHash).not.toBe('Secure123');
    expect(createCall.data.passwordHash).toMatch(/^scrypt\$/);
  });

  it('rejects an invalid email address', async () => {
    const response = await request(createApp()).post('/api/auth/register').send({
      email: 'not-an-email',
      password: 'Secure123',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { message: 'A valid email address is required' },
    });
    expect(databaseMocks.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid password', async () => {
    const response = await request(createApp()).post('/api/auth/register').send({
      email: 'user@example.com',
      password: 'short',
    });

    expect(response.status).toBe(400);
    expect(databaseMocks.create).not.toHaveBeenCalled();
  });

  it('prevents duplicate email registration', async () => {
    databaseMocks.findUnique.mockResolvedValue({ id: user.id });

    const response = await request(createApp()).post('/api/auth/register').send({
      email: user.email,
      password: 'Secure123',
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { message: 'An account with this email already exists' },
    });
    expect(databaseMocks.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/login', () => {
  it('returns a JWT for valid credentials', async () => {
    const passwordHash = await hashPassword('Secure123');
    databaseMocks.findUnique.mockResolvedValue({ ...user, passwordHash });

    const response = await request(createApp()).post('/api/auth/login').send({
      email: user.email,
      password: 'Secure123',
    });
    const responseBody = response.body as { token: unknown; user: unknown };

    expect(response.status).toBe(200);
    expect(responseBody.token).toEqual(expect.any(String));
    expect(responseBody.user).toEqual({
      ...user,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(responseBody.user).not.toHaveProperty('passwordHash');
  });

  it('returns a generic error for an incorrect password', async () => {
    const passwordHash = await hashPassword('Secure123');
    databaseMocks.findUnique.mockResolvedValue({ ...user, passwordHash });

    const response = await request(createApp()).post('/api/auth/login').send({
      email: user.email,
      password: 'Incorrect123',
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { message: 'Invalid email or password' },
    });
  });
});

describe('GET /api/auth/me', () => {
  it('rejects a request without a Bearer token', async () => {
    const response = await request(createApp()).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { message: 'Authentication required' },
    });
  });

  it('returns the authenticated user for a valid token', async () => {
    const token = await createAccessToken(user.id);
    databaseMocks.findUnique.mockResolvedValue(user);

    const response = await request(createApp())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: {
        ...user,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
  });

  it('rejects an invalid token', async () => {
    const response = await request(createApp())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { message: 'Authentication required' },
    });
  });
});
