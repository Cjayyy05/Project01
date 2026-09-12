import { database } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { createAccessToken } from './token.service.js';

const publicUserSelect = {
  id: true,
  email: true,
  createdAt: true,
  updatedAt: true,
} as const;

type PublicUser = {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

type LoginResult = {
  token: string;
  user: PublicUser;
};

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'P2002';

export const registerUser = async (
  email: string,
  password: string,
  registrationEnabled = env.registrationEnabled,
): Promise<PublicUser> => {
  if (!registrationEnabled) {
    throw new AppError(403, 'Registration is disabled by the DeployFlow operator');
  }

  const existingUser = await database.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser !== null) {
    throw new AppError(409, 'An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);

  try {
    return await database.user.create({
      data: { email, passwordHash },
      select: publicUserSelect,
    });
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(409, 'An account with this email already exists');
    }

    throw error;
  }
};

export const loginUser = async (
  email: string,
  password: string,
): Promise<LoginResult> => {
  const user = await database.user.findUnique({ where: { email } });

  if (user === null || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(401, 'Invalid email or password');
  }

  const token = await createAccessToken(user.id);

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  };
};

export const getAuthenticatedUser = async (
  userId: string,
): Promise<PublicUser> => {
  const user = await database.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });

  if (user === null) {
    throw new AppError(401, 'Authentication required');
  }

  return user;
};
