import { AppError } from './app-error.js';

const GITHUB_HOSTNAME = 'github.com';
const GITHUB_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9._-]+(?:\.git)?$/;
const INVALID_REPOSITORY_NAMES = new Set(['.', '..', '.git']);

export type GitHubRepository = {
  owner: string;
  name: string;
  repositoryUrl: string;
};

export const parseGitHubRepositoryUrl = (value: unknown): GitHubRepository => {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new AppError(400, 'A valid public GitHub HTTPS URL is required');
  }

  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new AppError(400, 'A valid public GitHub HTTPS URL is required');
  }

  const path = url.pathname.endsWith('/')
    ? url.pathname.slice(0, -1)
    : url.pathname;
  const segments = path.startsWith('/') ? path.slice(1).split('/') : [];
  const [owner, repositoryWithSuffix] = segments;

  if (
    url.protocol !== 'https:' ||
    url.hostname !== GITHUB_HOSTNAME ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    segments.length !== 2 ||
    owner === undefined ||
    repositoryWithSuffix === undefined ||
    !GITHUB_OWNER_PATTERN.test(owner) ||
    !GITHUB_REPOSITORY_PATTERN.test(repositoryWithSuffix) ||
    INVALID_REPOSITORY_NAMES.has(repositoryWithSuffix)
  ) {
    throw new AppError(400, 'A valid public GitHub HTTPS URL is required');
  }

  const name = repositoryWithSuffix.endsWith('.git')
    ? repositoryWithSuffix.slice(0, -4)
    : repositoryWithSuffix;

  if (name.length === 0 || INVALID_REPOSITORY_NAMES.has(name)) {
    throw new AppError(400, 'A valid public GitHub HTTPS URL is required');
  }

  return {
    owner,
    name,
    repositoryUrl: `https://${GITHUB_HOSTNAME}/${owner}/${name}`,
  };
};

