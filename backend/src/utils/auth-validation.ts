import { AppError } from './app-error.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

type Credentials = {
  email: string;
  password: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export const parseRegistration = (body: unknown): Credentials => {
  if (!isRecord(body)) {
    throw new AppError(400, 'Request body must be a JSON object');
  }

  if (typeof body.email !== 'string') {
    throw new AppError(400, 'A valid email address is required');
  }

  const email = normalizeEmail(body.email);

  if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
    throw new AppError(400, 'A valid email address is required');
  }

  if (typeof body.password !== 'string') {
    throw new AppError(400, 'A valid password is required');
  }

  const { password } = body;

  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new AppError(
      400,
      'Password must be 8 to 128 characters and include a letter and a number',
    );
  }

  return { email, password };
};

export const parseLogin = (body: unknown): Credentials => {
  if (
    !isRecord(body) ||
    typeof body.email !== 'string' ||
    typeof body.password !== 'string'
  ) {
    throw new AppError(401, 'Invalid email or password');
  }

  const email = normalizeEmail(body.email);

  if (
    email.length > 320 ||
    !EMAIL_PATTERN.test(email) ||
    body.password.length === 0 ||
    body.password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new AppError(401, 'Invalid email or password');
  }

  return { email, password: body.password };
};

