process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  'postgresql://deployflow:test-only@localhost:5432/deployflow_test?schema=public';
process.env.JWT_SECRET =
  'test-only-jwt-secret-that-is-never-used-in-production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.GITHUB_WEBHOOK_SECRET_KEY =
  'test-only-github-webhook-key-never-used-in-production';
process.env.PUBLIC_BASE_URL = 'http://localhost:4000';
