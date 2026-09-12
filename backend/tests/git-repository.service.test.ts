import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GitRepositoryService,
  type GitCommandRunner,
} from '../src/services/git-repository.service.js';
import { ApplicationDetector } from '../src/services/application-detector.service.js';

const repositoryUrl = 'https://github.com/example/example-api';
const commitHash = '0123456789abcdef0123456789abcdef01234567';

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

describe('GitRepositoryService', () => {
  let runGit: ReturnType<typeof vi.fn<GitCommandRunner>>;

  beforeEach(() => {
    runGit = vi.fn<GitCommandRunner>();
  });

  it('rejects an invalid URL before creating or cloning', async () => {
    const service = new GitRepositoryService({ runGit });

    await expect(
      service.prepareRepository({ repositoryUrl: 'not-a-url', branch: 'main' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'A valid public GitHub HTTPS URL is required',
    });
    expect(runGit).not.toHaveBeenCalled();
  });

  it('rejects a non-GitHub URL', async () => {
    const service = new GitRepositoryService({ runGit });

    await expect(
      service.prepareRepository({
        repositoryUrl: 'https://gitlab.com/example/example-api',
        branch: 'main',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(runGit).not.toHaveBeenCalled();
  });

  it.each([
    'file:///tmp/example-api',
    'ssh://github.com/example/example-api',
    'git://github.com/example/example-api',
  ])('rejects the unsupported repository protocol in %s', async (url) => {
    const service = new GitRepositoryService({ runGit });

    await expect(
      service.prepareRepository({ repositoryUrl: url, branch: 'main' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(runGit).not.toHaveBeenCalled();
  });

  it('rejects a missing branch', async () => {
    const service = new GitRepositoryService({ runGit });

    await expect(
      service.prepareRepository({ repositoryUrl, branch: '' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Repository branch is invalid',
    });
    expect(runGit).not.toHaveBeenCalled();
  });

  it('returns a structured clone error and removes the temporary directory', async () => {
    let temporaryPath: string | undefined;
    runGit.mockImplementation((args) => {
      temporaryPath = args.at(-1);
      return Promise.reject(new Error('raw Git error that must not escape'));
    });
    const service = new GitRepositoryService({ runGit });

    await expect(
      service.prepareRepository({ repositoryUrl, branch: 'main' }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message:
        'Repository could not be cloned or the requested branch was not found',
    });
    expect(temporaryPath).toBeDefined();
    expect(await pathExists(temporaryPath ?? '')).toBe(false);
  });

  it('keeps a Dockerfile-free clone available for application detection and cleanup', async () => {
    let temporaryPath: string | undefined;
    runGit.mockImplementation(async (args) => {
      if (args[0] === 'clone') {
        temporaryPath = args.at(-1);
        if (temporaryPath === undefined) throw new Error('Missing destination');
        await writeFile(
          join(temporaryPath, 'package.json'),
          JSON.stringify({ scripts: { start: 'node server.js' } }),
        );
        return '';
      }

      return `${commitHash}\n`;
    });
    const service = new GitRepositoryService({ runGit });

    const prepared = await service.prepareRepository({
      repositoryUrl,
      branch: 'main',
    });
    const detected = await new ApplicationDetector().prepareBuild({
      repositoryDirectory: prepared.repositoryPath,
      containerPort: 8080,
    });

    expect(detected.applicationType).toBe('NODE');
    expect(await pathExists(join(prepared.repositoryPath, 'Dockerfile'))).toBe(
      true,
    );

    await service.cleanup(prepared.repositoryPath);
    expect(await pathExists(prepared.repositoryPath)).toBe(false);
  });

  it('validates a repository and provides explicit cleanup', async () => {
    runGit.mockImplementation(async (args) => {
      if (args[0] === 'clone') {
        const destination = args.at(-1);

        if (destination === undefined) {
          throw new Error('Clone destination was not provided');
        }

        await writeFile(join(destination, 'Dockerfile'), 'FROM scratch\n');
        return '';
      }

      return `${commitHash.toUpperCase()}\n`;
    });
    const service = new GitRepositoryService({ runGit });

    const result = await service.prepareRepository({
      repositoryUrl: `${repositoryUrl}.git`,
      branch: 'feature/deploy',
    });

    expect(result).toEqual({
      repositoryPath: result.repositoryPath,
      commitHash,
      metadata: {
        provider: 'github',
        owner: 'example',
        name: 'example-api',
        repositoryUrl,
        branch: 'feature/deploy',
      },
    });
    expect(await pathExists(join(result.repositoryPath, 'Dockerfile'))).toBe(
      true,
    );
    expect(runGit).toHaveBeenNthCalledWith(1, [
      'clone',
      '--depth',
      '1',
      '--single-branch',
      '--branch',
      'feature/deploy',
      '--',
      repositoryUrl,
      result.repositoryPath,
    ]);
    expect(runGit).toHaveBeenNthCalledWith(2, [
      '-C',
      result.repositoryPath,
      'rev-parse',
      'HEAD',
    ]);

    await service.cleanup(result.repositoryPath);

    expect(await pathExists(result.repositoryPath)).toBe(false);
  });

  it('retrieves an exact commit with argument-safe Git calls', async () => {
    runGit.mockImplementation(async (args) => {
      if (args[0] === 'init') {
        const destination = args.at(-1);
        if (destination === undefined) throw new Error('Missing destination');
        await writeFile(join(destination, 'Dockerfile'), 'FROM scratch\n');
      }

      if (args.at(-2) === 'rev-parse') return `${commitHash.toUpperCase()}\n`;
      return '';
    });
    const service = new GitRepositoryService({ runGit });

    const result = await service.prepareRepositoryAtCommit({
      repositoryUrl,
      branch: 'main',
      commitHash: commitHash.toUpperCase(),
    });

    expect(runGit).toHaveBeenNthCalledWith(1, [
      'init',
      '--',
      result.repositoryPath,
    ]);
    expect(runGit).toHaveBeenNthCalledWith(2, [
      '-C',
      result.repositoryPath,
      'remote',
      'add',
      'origin',
      repositoryUrl,
    ]);
    expect(runGit).toHaveBeenNthCalledWith(3, [
      '-C',
      result.repositoryPath,
      'fetch',
      '--depth',
      '1',
      'origin',
      commitHash,
    ]);
    expect(runGit).toHaveBeenNthCalledWith(4, [
      '-C',
      result.repositoryPath,
      'checkout',
      '--detach',
      'FETCH_HEAD',
    ]);
    expect(result.commitHash).toBe(commitHash);

    await service.cleanup(result.repositoryPath);
    expect(await pathExists(result.repositoryPath)).toBe(false);
  });

  it('rejects an invalid rollback commit before invoking Git', async () => {
    const service = new GitRepositoryService({ runGit });

    await expect(
      service.prepareRepositoryAtCommit({
        repositoryUrl,
        branch: 'main',
        commitHash: '--upload-pack=malicious',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Repository commit hash is invalid',
    });
    expect(runGit).not.toHaveBeenCalled();
  });
});
