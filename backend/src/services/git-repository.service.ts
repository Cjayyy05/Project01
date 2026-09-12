import { execFile } from 'node:child_process';
import { lstat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AppError } from '../utils/app-error.js';
import { parseGitHubRepositoryUrl } from '../utils/github-repository.js';

const TEMPORARY_DIRECTORY_PREFIX = 'deployflow-repository-';
const COMMIT_HASH_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i;
const ALLOWED_BRANCH_CHARACTERS = /^[A-Za-z0-9._/-]+$/;

export type GitRepositoryInput = {
  repositoryUrl: string;
  branch: string;
};

export type GitRepositoryCommitInput = GitRepositoryInput & {
  commitHash: string;
};

export type PreparedGitRepository = {
  repositoryPath: string;
  commitHash: string;
  metadata: {
    provider: 'github';
    owner: string;
    name: string;
    repositoryUrl: string;
    branch: string;
  };
};

export type GitCommandRunner = (args: readonly string[]) => Promise<string>;

type GitRepositoryServiceDependencies = {
  runGit?: GitCommandRunner;
};

const executeGit: GitCommandRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile(
      'git',
      [...args],
      {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error !== null) {
          reject(
            error instanceof Error ? error : new Error('Git process failed'),
          );
          return;
        }

        resolve(stdout);
      },
    );
  });

const parseBranch = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new AppError(400, 'Repository branch is required');
  }

  const branch = value.trim();
  const segments = branch.split('/');
  const hasInvalidSegment = segments.some(
    (segment) =>
      segment.length === 0 ||
      segment.startsWith('.') ||
      segment.endsWith('.') ||
      segment.endsWith('.lock'),
  );

  if (
    branch.length === 0 ||
    branch.length > 255 ||
    branch.startsWith('-') ||
    branch.includes('..') ||
    !ALLOWED_BRANCH_CHARACTERS.test(branch) ||
    hasInvalidSegment
  ) {
    throw new AppError(400, 'Repository branch is invalid');
  }

  return branch;
};

const isMissingFileError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT';

export class GitRepositoryService {
  readonly #runGit: GitCommandRunner;
  readonly #managedDirectories = new Set<string>();

  public constructor(dependencies: GitRepositoryServiceDependencies = {}) {
    this.#runGit = dependencies.runGit ?? executeGit;
  }

  public async prepareRepository(
    input: GitRepositoryInput,
  ): Promise<PreparedGitRepository> {
    const repository = parseGitHubRepositoryUrl(input.repositoryUrl);
    const branch = parseBranch(input.branch);
    let repositoryPath: string;

    try {
      repositoryPath = await mkdtemp(
        join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX),
      );
      this.#managedDirectories.add(repositoryPath);
    } catch {
      throw new AppError(500, 'Unable to create temporary repository directory');
    }

    try {
      try {
        await this.#runGit([
          'clone',
          '--depth',
          '1',
          '--single-branch',
          '--branch',
          branch,
          '--',
          repository.repositoryUrl,
          repositoryPath,
        ]);
      } catch {
        throw new AppError(
          422,
          'Repository could not be cloned or the requested branch was not found',
        );
      }

      let commitHash: string;

      try {
        commitHash = (
          await this.#runGit(['-C', repositoryPath, 'rev-parse', 'HEAD'])
        ).trim();
      } catch {
        throw new AppError(422, 'Unable to determine repository commit');
      }

      if (!COMMIT_HASH_PATTERN.test(commitHash)) {
        throw new AppError(422, 'Repository returned an invalid commit hash');
      }

      try {
        const dockerfile = await lstat(join(repositoryPath, 'Dockerfile'));

        if (!dockerfile.isFile()) {
          throw new AppError(422, 'Dockerfile not found at repository root');
        }
      } catch (error: unknown) {
        if (error instanceof AppError) {
          throw error;
        }

        if (isMissingFileError(error)) {
          throw new AppError(422, 'Dockerfile not found at repository root');
        }

        throw new AppError(500, 'Unable to inspect repository Dockerfile');
      }

      return {
        repositoryPath,
        commitHash: commitHash.toLowerCase(),
        metadata: {
          provider: 'github',
          owner: repository.owner,
          name: repository.name,
          repositoryUrl: repository.repositoryUrl,
          branch,
        },
      };
    } catch (error: unknown) {
      try {
        await this.#removeManagedDirectory(repositoryPath);
      } catch {
        throw new AppError(
          500,
          'Repository operation failed and temporary cleanup was unsuccessful',
        );
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(500, 'Unable to prepare repository');
    }
  }

  public async prepareRepositoryAtCommit(
    input: GitRepositoryCommitInput,
  ): Promise<PreparedGitRepository> {
    const repository = parseGitHubRepositoryUrl(input.repositoryUrl);
    const branch = parseBranch(input.branch);
    const commitHash = input.commitHash.trim().toLowerCase();

    if (!COMMIT_HASH_PATTERN.test(commitHash)) {
      throw new AppError(400, 'Repository commit hash is invalid');
    }

    let repositoryPath: string;

    try {
      repositoryPath = await mkdtemp(
        join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX),
      );
      this.#managedDirectories.add(repositoryPath);
    } catch {
      throw new AppError(500, 'Unable to create temporary repository directory');
    }

    try {
      try {
        await this.#runGit(['init', '--', repositoryPath]);
        await this.#runGit([
          '-C',
          repositoryPath,
          'remote',
          'add',
          'origin',
          repository.repositoryUrl,
        ]);
        await this.#runGit([
          '-C',
          repositoryPath,
          'fetch',
          '--depth',
          '1',
          'origin',
          commitHash,
        ]);
        await this.#runGit([
          '-C',
          repositoryPath,
          'checkout',
          '--detach',
          'FETCH_HEAD',
        ]);
      } catch {
        throw new AppError(422, 'Repository commit could not be retrieved');
      }

      let checkedOutCommit: string;

      try {
        checkedOutCommit = (
          await this.#runGit(['-C', repositoryPath, 'rev-parse', 'HEAD'])
        )
          .trim()
          .toLowerCase();
      } catch {
        throw new AppError(422, 'Unable to verify repository commit');
      }

      if (checkedOutCommit !== commitHash) {
        throw new AppError(422, 'Repository returned an unexpected commit');
      }

      await this.#verifyRootDockerfile(repositoryPath);

      return {
        repositoryPath,
        commitHash,
        metadata: {
          provider: 'github',
          owner: repository.owner,
          name: repository.name,
          repositoryUrl: repository.repositoryUrl,
          branch,
        },
      };
    } catch (error: unknown) {
      try {
        await this.#removeManagedDirectory(repositoryPath);
      } catch {
        throw new AppError(
          500,
          'Repository operation failed and temporary cleanup was unsuccessful',
        );
      }

      if (error instanceof AppError) throw error;
      throw new AppError(500, 'Unable to prepare repository commit');
    }
  }

  public async cleanup(repositoryPath: string): Promise<void> {
    if (!this.#managedDirectories.has(repositoryPath)) {
      throw new AppError(400, 'Repository path is not managed by this service');
    }

    try {
      await this.#removeManagedDirectory(repositoryPath);
    } catch {
      throw new AppError(500, 'Unable to clean up temporary repository');
    }
  }

  async #verifyRootDockerfile(repositoryPath: string): Promise<void> {
    try {
      const dockerfile = await lstat(join(repositoryPath, 'Dockerfile'));

      if (!dockerfile.isFile()) {
        throw new AppError(422, 'Dockerfile not found at repository root');
      }
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      if (isMissingFileError(error)) {
        throw new AppError(422, 'Dockerfile not found at repository root');
      }
      throw new AppError(500, 'Unable to inspect repository Dockerfile');
    }
  }

  async #removeManagedDirectory(repositoryPath: string): Promise<void> {
    await rm(repositoryPath, { recursive: true, force: true });
    this.#managedDirectories.delete(repositoryPath);
  }
}

export const gitRepositoryService = new GitRepositoryService();
