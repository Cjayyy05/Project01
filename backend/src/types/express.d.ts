import 'express-serve-static-core';

type AuthIdentity = {
  userId: string;
};

declare module 'express-serve-static-core' {
  // Interface declaration is required for Express request module augmentation.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Request {
    auth?: AuthIdentity;
  }
}
