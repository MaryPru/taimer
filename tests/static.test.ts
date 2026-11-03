import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { IN_MEMORY, openDb, type Db } from '../src/server/db.js';

// В продакшен-режиме тот же сервер отдаёт собранный клиент. Тест держит в рабочем состоянии
// @fastify/static вместе с подменённой в package.json версией glob (overrides).
describe('собранный клиент', () => {
  let dir: string;
  let db: Db;
  let app: FastifyInstance;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'taimer-web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Taimer</title>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    db = openDb(IN_MEMORY);
    app = await buildApp({ db, webDir: dir });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('отдаёт страницу и файлы сборки', async () => {
    const page = await app.inject({ method: 'GET', url: '/' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/^text\/html/);
    expect(page.body).toContain('<title>Taimer</title>');

    const script = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toMatch(/javascript/);
  });

  it('API работает рядом со статикой, неизвестные пути дают 404 в общем формате', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({ status: 'ok' });

    const missing = await app.inject({ method: 'GET', url: '/nope.js' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: 'NOT_FOUND' });
  });
});
