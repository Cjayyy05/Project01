import type { RequestHandler } from 'express';

import {
  getAuthenticatedUser,
  loginUser,
  registerUser,
} from '../services/auth.service.js';
import { AppError } from '../utils/app-error.js';
import { parseLogin, parseRegistration } from '../utils/auth-validation.js';

export const register: RequestHandler = async (request, response) => {
  const { email, password } = parseRegistration(request.body);
  const user = await registerUser(email, password);

  response.status(201).json({ user });
};

export const login: RequestHandler = async (request, response) => {
  const { email, password } = parseLogin(request.body);
  const result = await loginUser(email, password);

  response.status(200).json(result);
};

export const me: RequestHandler = async (request, response) => {
  if (request.auth === undefined) {
    throw new AppError(401, 'Authentication required');
  }

  const user = await getAuthenticatedUser(request.auth.userId);

  response.status(200).json({ user });
};

