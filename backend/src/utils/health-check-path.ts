import { AppError } from './app-error.js';

const MAX_HEALTH_CHECK_PATH_LENGTH = 1024;
const SAFE_PATH_CHARACTERS = /^[A-Za-z0-9\-._~!$&'()*+,;=:@/%]+$/;

export const parseHealthCheckPath = (
  value: unknown,
  defaultValue = '/',
): string => {
  const candidate = value === undefined ? defaultValue : value;

  if (typeof candidate !== 'string') {
    throw new AppError(400, 'Health-check path must be a string');
  }

  const path = candidate.trim();
  if (
    path.length === 0 ||
    path.length > MAX_HEALTH_CHECK_PATH_LENGTH ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    !SAFE_PATH_CHARACTERS.test(path)
  ) {
    throw new AppError(
      400,
      'Health-check path must be an application-relative path such as /health',
    );
  }

  try {
    decodeURI(path);
  } catch {
    throw new AppError(400, 'Health-check path contains invalid encoding');
  }

  return path;
};
