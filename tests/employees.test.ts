import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIMITS } from '../src/shared/types.js';
import { createTestApp, type TestContext } from './helpers.js';

describe('сотрудники', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it('добавляет сотрудника, убирает пробелы по краям и схлопывает внутренние', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/employees',
      payload: { name: '  Анна   Тестова  ' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: 1, name: 'Анна Тестова' });
  });

  it('показывает список в порядке добавления, без идущих таймеров', async () => {
    await ctx.app.inject({ method: 'POST', url: '/api/employees', payload: { name: 'Анна Тестова' } });
    await ctx.app.inject({ method: 'POST', url: '/api/employees', payload: { name: 'Борис Пробный' } });

    const response = await ctx.app.inject({ method: 'GET', url: '/api/employees' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: 1, name: 'Анна Тестова', activeEntry: null },
      { id: 2, name: 'Борис Пробный', activeEntry: null },
    ]);
  });

  it('разрешает тёзок: форма только предупреждает о совпадении', async () => {
    const first = await ctx.app.inject({ method: 'POST', url: '/api/employees', payload: { name: 'Анна Тестова' } });
    const second = await ctx.app.inject({ method: 'POST', url: '/api/employees', payload: { name: 'Анна Тестова' } });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual({ id: 2, name: 'Анна Тестова' });
  });

  it('пустой список, пока никого не добавили', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/employees' });
    expect(response.json()).toEqual([]);
  });

  it.each([
    ['пустое имя', { name: '' }],
    ['имя из пробелов', { name: '   ' }],
    ['слишком длинное имя', { name: 'А'.repeat(LIMITS.employeeNameMax + 1) }],
    ['нет поля name', {}],
    ['name объект', { name: { first: 'Анна' } }],
    // Без отключённого приведения типов Fastify создал бы сотрудников "123", "true" и "".
    ['name число', { name: 123 }],
    ['name true', { name: true }],
    ['name null', { name: null }],
  ])('отклоняет запрос: %s', async (_case, payload) => {
    const response = await ctx.app.inject({ method: 'POST', url: '/api/employees', payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    const list = await ctx.app.inject({ method: 'GET', url: '/api/employees' });
    expect(list.json()).toEqual([]);
  });

  it('принимает имя ровно максимальной длины', async () => {
    const name = 'А'.repeat(LIMITS.employeeNameMax);
    const response = await ctx.app.inject({ method: 'POST', url: '/api/employees', payload: { name } });
    expect(response.statusCode).toBe(201);
  });

  it('отвечает на неизвестный маршрут API в общем формате ошибок', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'NOT_FOUND' });
  });
});
