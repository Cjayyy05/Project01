import type { RequestHandler } from 'express';

import { verifyAccessToken } from '../services/token.service.js';
import { AppError } from '../utils/app-error.js';

const BEARER_TOKEN_PATTERN = /^Bearer\s+(\S+)$/i;

export const authenticate: RequestHandler = async (request, _response, next) => {
  const authorization = request.header('authorization');
  const token = authorization?.match(BEARER_TOKEN_PATTERN)?.[1];

  if (token === undefined) {
    next(new AppError(401, 'Authentication required'));
    return;
  }

  try {
    request.auth = { userId: await verifyAccessToken(token) };
    next();
  } catch {
    next(new AppError(401, 'Authentication required'));
  }
};

