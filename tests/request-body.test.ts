import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestContext } from './helpers.js';

const json = { 'content-type': 'application/json' };

describe('тело запроса', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  afterEach(async () => {
    await ctx.close();
  });

  const employees = async () => (await ctx.app.inject({ method: 'GET', url: '/api/employees' })).json();

  it('принимает кириллицу в UTF-8', async () => {
    const payload = Buffer.from(JSON.stringify({ name: 'Анна Тестова' }), 'utf8');
    const response = await ctx.app.inject({ method: 'POST', url: '/api/employees', headers: json, payload });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: 'Анна Тестова' });
  });

  it('отклоняет текст не в UTF-8, а не сохраняет «����»', async () => {
    // «Анна» в cp1251: так отправляет curl из консоли Windows.
    const payload = Buffer.concat([Buffer.from('{"name":"'), Buffer.from([0xc0, 0xed, 0xed, 0xe0]), Buffer.from('"}')]);
    const response = await ctx.app.inject({ method: 'POST', url: '/api/employees', headers: json, payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'BAD_REQUEST', message: 'Тело запроса должно быть в кодировке UTF-8' });
    expect(await employees()).toEqual([]);
  });

  it.each([
    ['битый JSON', '{"name":'],
    ['пустое тело', ''],
    ['__proto__ в теле', '{"name":"Анна","__proto__":{"admin":true}}'],
    ['constructor.prototype в теле', '{"name":"Анна","constructor":{"prototype":{"admin":true}}}'],
  ])('стандартная проверка JSON сохранилась: %s', async (_case, payload) => {
    const response = await ctx.app.inject({ method: 'POST', url: '/api/employees', headers: json, payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'BAD_REQUEST' });
    expect(await employees()).toEqual([]);
  });
});
