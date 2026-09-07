import type { Request } from 'express';

import { AppError } from './app-error.js';

export const getAuthenticatedUserId = (request: Request): string => {
  if (request.auth === undefined) {
    throw new AppError(401, 'Authentication required');
  }

  return request.auth.userId;
};

