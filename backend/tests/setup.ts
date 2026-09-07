process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  'postgresql://deployflow:test-only@localhost:5432/deployflow_test?schema=public';
process.env.JWT_SECRET =
  'test-only-jwt-secret-that-is-never-used-in-production';
process.env.JWT_EXPIRES_IN = '1h';

