import { jwtVerify, SignJWT } from 'jose';

import { env } from '../config/env.js';

const JWT_ALGORITHM = 'HS256';
const secret = new TextEncoder().encode(env.jwtSecret);

export const createAccessToken = async (userId: string): Promise<string> =>
  new SignJWT({})
    .setProtectedHeader({ alg: JWT_ALGORITHM, typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.jwtExpiresIn)
    .sign(secret);

export const verifyAccessToken = async (token: string): Promise<string> => {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: [JWT_ALGORITHM],
  });

  if (payload.sub === undefined || payload.sub === '') {
    throw new Error('JWT subject is missing');
  }

  return payload.sub;
};

