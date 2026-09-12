import { describe, expect, it, vi } from 'vitest';

import {
  ApplicationHealthCheckService,
  type LocalHealthRequest,
} from '../src/services/application-health-check.service.js';

const hostPort = 49_153;

describe('ApplicationHealthCheckService', () => {
  const createService = (
    requestHealth: ReturnType<typeof vi.fn<LocalHealthRequest>>,
    sleep = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined),
  ) => ({
    service: new ApplicationHealthCheckService({
      requestHealth,
      sleep,
      maxAttempts: 3,
      requestTimeoutMs: 250,
      retryDelayMs: 10,
    }),
    sleep,
  });

  it('accepts an immediate successful HTTP response', async () => {
    const requestHealth = vi
      .fn<LocalHealthRequest>()
      .mockResolvedValue(204);
    const { service, sleep } = createService(requestHealth);

    await expect(
      service.waitUntilHealthy({ hostPort, path: '/health' }),
    ).resolves.toBeUndefined();

    expect(requestHealth).toHaveBeenCalledOnce();
    expect(requestHealth).toHaveBeenCalledWith({
      hostPort,
      path: '/health',
      timeoutMs: 250,
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a delayed application until it becomes healthy', async () => {
    const requestHealth = vi
      .fn<LocalHealthRequest>()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(503)
      .mockResolvedValueOnce(200);
    const { service, sleep } = createService(requestHealth);

    await service.waitUntilHealthy({ hostPort, path: '/' });

    expect(requestHealth).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 10);
    expect(sleep).toHaveBeenNthCalledWith(2, 10);
  });

  it('returns a safe failure after bounded unsuccessful responses', async () => {
    const requestHealth = vi
      .fn<LocalHealthRequest>()
      .mockResolvedValue(503);
    const { service, sleep } = createService(requestHealth);

    await expect(
      service.waitUntilHealthy({ hostPort, path: '/api/health' }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: 'Application did not become healthy at /api/health',
    });
    expect(requestHealth).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('treats request timeouts as retryable and keeps the per-request timeout', async () => {
    const requestHealth = vi
      .fn<LocalHealthRequest>()
      .mockRejectedValue(new Error('Health-check request timed out'));
    const { service } = createService(requestHealth);

    await expect(
      service.waitUntilHealthy({ hostPort, path: '/health' }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(requestHealth).toHaveBeenCalledTimes(3);
    expect(requestHealth.mock.calls.every(([input]) => input.timeoutMs === 250)).toBe(
      true,
    );
  });

  it.each([
    'https://example.com',
    '//evil.com',
    'ftp://example.com',
    '/health?next=https://example.com',
    '/health#fragment',
    '/health\\redirect',
    '/health check',
  ])('rejects unsafe or external health-check path %s', async (path) => {
    const requestHealth = vi
      .fn<LocalHealthRequest>()
      .mockResolvedValue(200);
    const { service } = createService(requestHealth);

    await expect(
      service.waitUntilHealthy({ hostPort, path }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(requestHealth).not.toHaveBeenCalled();
  });
});
