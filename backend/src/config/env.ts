import 'dotenv/config';

const DEFAULT_PORT = 4000;

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

const parseJwtSecret = (value: string | undefined): string => {
  const secret = requireValue('JWT_SECRET', value);

  if (secret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }

  return secret;
};

export const env = Object.freeze({
  databaseUrl: requireValue('DATABASE_URL', process.env.DATABASE_URL),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  jwtSecret: parseJwtSecret(process.env.JWT_SECRET),
  nodeEnv: parseNodeEnv(process.env.NODE_ENV),
  port: parsePort(process.env.PORT),
});
