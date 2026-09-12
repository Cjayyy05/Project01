import { describe, expect, it } from 'vitest';

import { parseSecret } from '../src/config/env.js';

describe('secret configuration', () => {
  it.each([
    [
      'JWT_SECRET' as const,
      'replace-with-at-least-32-random-characters',
    ],
    [
      'GITHUB_WEBHOOK_SECRET_KEY' as const,
      'replace-with-a-different-32-character-random-secret',
    ],
    ['JWT_SECRET' as const, 'this-is-an-obvious-placeholder-secret-value'],
  ])('rejects an insecure %s placeholder', (name, value) => {
    expect(() => parseSecret(name, value, 'production', value)).toThrow(
      `${name} must be replaced with a cryptographically random value`,
    );
  });

  it('accepts a sufficiently long random-looking value', () => {
    const secret = 'iR8RkCNVp2QdUF87x2dHq3QzrB3h1K8mFzR9dQ4sY1A';

    expect(
      parseSecret('JWT_SECRET', secret, 'production', 'not-this-value'),
    ).toBe(secret);
  });
});
