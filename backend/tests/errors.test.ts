import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

describe('centralized error handling', () => {
  it('returns a JSON 404 response for an unknown route', async () => {
    const response = await request(createApp()).get('/api/unknown');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { message: 'Route GET /api/unknown not found' },
    });
  });
});
