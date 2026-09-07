import type { ErrorRequestHandler } from 'express';

import { AppError } from '../utils/app-error.js';

type ErrorBody = {
  error: {
    message: string;
  };
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: { message: error.message },
    } satisfies ErrorBody);
    return;
  }

  response.status(500).json({
    error: { message: 'Internal server error' },
  } satisfies ErrorBody);
};
