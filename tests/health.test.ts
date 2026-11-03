import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { IN_MEMORY, openDb } from '../src/server/db.js';

describe('GET /api/health', () => {
  it('отвечает 200, когда база доступна', async () => {
    const db = openDb(IN_MEMORY);
    const app = await buildApp({ db });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await app.close();
    db.close();
  });
});
