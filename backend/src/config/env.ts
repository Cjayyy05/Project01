import 'dotenv/config';

import { isIP } from 'node:net';

const DEFAULT_PORT = 4000;
const DEFAULT_BIND_HOST = '127.0.0.1';
const JWT_SECRET_EXAMPLE = 'replace-with-at-least-32-random-characters';
const WEBHOOK_SECRET_EXAMPLE =
  'replace-with-a-different-32-character-random-secret';
const OBVIOUSLY_WEAK_SECRET_PATTERN =
  /(change[-_ ]?me|replace[-_ ]?with|placeholder|example[-_ ]?secret|secret[-_ ]?here|your[-_ ]?secret)/i;

const requireValue = (name: string, value: string | undefined): string => {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required`);
  }

  return value;
};

const parsePort = (value: string | undefined): number => {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
};

const parseNodeEnv = (
  value: string | undefined,
): 'development' | 'test' | 'production' => {
  if (value === undefined) {
    return 'development';
  }

  if (value === 'development' || value === 'test' || value === 'production') {
    return value;
  }

  throw new Error('NODE_ENV must be development, test, or production');
};

const parseBoolean = (
  name: string,
  value: string | undefined,
  defaultValue: boolean,
): boolean => {
  if (value === undefined) return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
};

const parseBindHost = (value: string | undefined): string => {
  const host = value?.trim() ?? DEFAULT_BIND_HOST;
  const hostnamePattern =
    /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/;

  if (isIP(host) === 0 && !hostnamePattern.test(host)) {
    throw new Error('BIND_HOST must be a valid IP address or hostname');
  }

  return host;
};

export const parseSecret = (
  name: 'JWT_SECRET' | 'GITHUB_WEBHOOK_SECRET_KEY',
  value: string | undefined,
  nodeEnv: 'development' | 'test' | 'production',
  knownPlaceholder: string,
): string => {
  const secret = requireValue(name, value).trim();

  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error(`${name} must contain at least 32 bytes`);
  }

  if (
    nodeEnv !== 'test' &&
    (secret === knownPlaceholder || OBVIOUSLY_WEAK_SECRET_PATTERN.test(secret))
  ) {
    throw new Error(`${name} must be replaced with a cryptographically random value`);
  }

  return secret;
};

const parseWebhookSecretKey = (
  value: string | undefined,
  nodeEnv: 'development' | 'test' | 'production',
): string | undefined => {
  if (value === undefined || value.trim() === '') return undefined;
  return parseSecret(
    'GITHUB_WEBHOOK_SECRET_KEY',
    value,
    nodeEnv,
    WEBHOOK_SECRET_EXAMPLE,
  );
};

const parsePublicBaseUrl = (
  value: string | undefined,
  port: number,
): string => {
  const candidate = value?.trim() ?? `http://localhost:${String(port)}`;
  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    throw new Error('PUBLIC_BASE_URL must be a valid HTTP or HTTPS origin');
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('PUBLIC_BASE_URL must be a valid HTTP or HTTPS origin');
  }

  return url.origin;
};

const port = parsePort(process.env.PORT);
const nodeEnv = parseNodeEnv(process.env.NODE_ENV);

export const env = Object.freeze({
  bindHost: parseBindHost(process.env.BIND_HOST),
  databaseUrl: requireValue('DATABASE_URL', process.env.DATABASE_URL),
  githubWebhookSecretKey: parseWebhookSecretKey(
    process.env.GITHUB_WEBHOOK_SECRET_KEY,
    nodeEnv,
  ),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  jwtSecret: parseSecret(
    'JWT_SECRET',
    process.env.JWT_SECRET,
    nodeEnv,
    JWT_SECRET_EXAMPLE,
  ),
  nodeEnv,
  port,
  publicBaseUrl: parsePublicBaseUrl(process.env.PUBLIC_BASE_URL, port),
  registrationEnabled: parseBoolean(
    'REGISTRATION_ENABLED',
    process.env.REGISTRATION_ENABLED,
    false,
  ),
});
