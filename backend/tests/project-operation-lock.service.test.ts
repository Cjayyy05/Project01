import { describe, expect, it, vi } from 'vitest';

import {
  ProjectOperationLockService,
  type ProjectOperationLockDatabase,
} from '../src/services/project-operation-lock.service.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const firstToken = '22222222-2222-4222-8222-222222222222';
const secondToken = '33333333-3333-4333-8333-333333333333';

describe('ProjectOperationLockService', () => {
  const createHarness = () => {
    let activeToken: string | null = null;
    let expiresAt: Date | null = null;
    let now = new Date('2026-09-12T00:00:00.000Z');
    const tokens = [firstToken, secondToken];
    const updateMany = vi.fn((options: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const requestedToken = options.where.operationLockToken;

      if (requestedToken !== undefined) {
        if (requestedToken !== activeToken) {
          return Promise.resolve({ count: 0 });
        }
        activeToken =
          (options.data.operationLockToken as string | null | undefined) ??
          activeToken;
        expiresAt =
          (options.data.operationLockExpiresAt as Date | null | undefined) ??
          expiresAt;
        if (options.data.operationLockToken === null) activeToken = null;
        if (options.data.operationLockExpiresAt === null) expiresAt = null;
        return Promise.resolve({ count: 1 });
      }

      if (
        activeToken !== null &&
        expiresAt !== null &&
        expiresAt.getTime() > now.getTime()
      ) {
        return Promise.resolve({ count: 0 });
      }

      activeToken = options.data.operationLockToken as string;
      expiresAt = options.data.operationLockExpiresAt as Date;
      return Promise.resolve({ count: 1 });
    });
    const database: ProjectOperationLockDatabase = {
      project: { updateMany },
    };
    const service = new ProjectOperationLockService({
      database,
      now: () => now,
      createToken: () => tokens.shift() ?? secondToken,
      leaseDurationMs: 60_000,
      renewalIntervalMs: 30_000,
    });

    return {
      service,
      setExistingLock: (token: string, expiry: Date) => {
        activeToken = token;
        expiresAt = expiry;
      },
      setNow: (value: Date) => {
        now = value;
      },
      updateMany,
    };
  };

  it('returns a conflict while another project operation is active', async () => {
    const { service } = createHarness();
    let finishFirst: (() => void) | undefined;
    const firstOperation = service.runExclusive(
      projectId,
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    await vi.waitFor(() => {
      expect(finishFirst).toBeDefined();
    });

    await expect(
      service.runExclusive(projectId, () => Promise.resolve()),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Another deployment operation is already active for this project',
    });

    finishFirst?.();
    await firstOperation;
  });

  it('releases the lock after success and failure', async () => {
    const { service } = createHarness();

    await expect(
      service.runExclusive(projectId, () => Promise.resolve('done')),
    ).resolves.toBe('done');
    await expect(
      service.runExclusive(projectId, () => Promise.reject(new Error('failed'))),
    ).rejects.toThrow('failed');
  });

  it('allows an expired stale lease to be replaced', async () => {
    const { service, setExistingLock, setNow } = createHarness();
    setExistingLock(firstToken, new Date('2026-09-12T00:01:00.000Z'));
    setNow(new Date('2026-09-12T00:02:00.000Z'));

    await expect(
      service.runExclusive(projectId, () => Promise.resolve('recovered')),
    ).resolves.toBe('recovered');
  });
});
