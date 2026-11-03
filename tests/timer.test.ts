import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIMITS, type EmployeeWithTimer } from '../src/shared/types.js';
import { addEmployee, countEntries, createTestApp, MINUTE, start, stop, type TestContext } from './helpers.js';

describe('таймер', () => {
  let ctx: TestContext;
  let annaId: number;

  beforeEach(async () => {
    ctx = await createTestApp('2026-11-02T09:00:00.000Z');
    annaId = (await addEmployee(ctx.app, 'Анна Тестова')).id;
  });

  afterEach(async () => {
    await ctx.close();
  });

  async function employees(): Promise<EmployeeWithTimer[]> {
    return (await ctx.app.inject({ method: 'GET', url: '/api/employees' })).json();
  }

  it('старт создаёт идущую запись, она видна в списке сотрудников', async () => {
    const response = await start(ctx.app, annaId, '  Вёрстка формы входа ');

    expect(response.statusCode).toBe(201);
    const entry = response.json();
    expect(entry).toEqual({
      id: 1,
      employeeId: annaId,
      task: 'Вёрстка формы входа',
      startedAt: '2026-11-02T09:00:00.000Z',
      endedAt: null,
    });
    expect((await employees())[0]!.activeEntry).toEqual(entry);
  });

  it('стоп закрывает запись текущим временем и снимает активный таймер', async () => {
    await start(ctx.app, annaId, 'Код-ревью');
    ctx.clock.advance(45 * MINUTE);

    const response = await stop(ctx.app, annaId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      task: 'Код-ревью',
      startedAt: '2026-11-02T09:00:00.000Z',
      endedAt: '2026-11-02T09:45:00.000Z',
    });
    expect((await employees())[0]!.activeEntry).toBeNull();
    expect(countEntries(ctx.db)).toBe(1);
  });

  describe('повторный запуск', () => {
    it('второй старт при идущем таймере даёт 409 и не трогает текущую запись', async () => {
      await start(ctx.app, annaId, 'Первая задача');
      ctx.clock.advance(10 * MINUTE);

      const response = await start(ctx.app, annaId, 'Вторая задача');

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: 'TIMER_ALREADY_RUNNING' });
      expect(countEntries(ctx.db)).toBe(1);
      expect((await employees())[0]!.activeEntry).toMatchObject({
        task: 'Первая задача',
        startedAt: '2026-11-02T09:00:00.000Z',
      });
    });

    it('старт после стопа создаёт новую запись, старая остаётся закрытой', async () => {
      await start(ctx.app, annaId, 'Первая задача');
      ctx.clock.advance(30 * MINUTE);
      await stop(ctx.app, annaId);
      ctx.clock.advance(5 * MINUTE);

      const response = await start(ctx.app, annaId, 'Вторая задача');

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ id: 2, task: 'Вторая задача', startedAt: '2026-11-02T09:35:00.000Z' });
      expect(countEntries(ctx.db)).toBe(2);
      const first = ctx.db.prepare('SELECT ended_at FROM time_entries WHERE id = 1').get();
      expect(first).toEqual({ ended_at: Date.parse('2026-11-02T09:30:00.000Z') });
    });

    it('два одновременных запроса на старт: один проходит, второй получает 409', async () => {
      const responses = await Promise.all([start(ctx.app, annaId, 'Клик'), start(ctx.app, annaId, 'Двойной клик')]);

      expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
      expect(countEntries(ctx.db)).toBe(1);
    });
  });

  it('стоп без идущего таймера даёт 409', async () => {
    const response = await stop(ctx.app, annaId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'TIMER_NOT_RUNNING' });
  });

  it('повторный стоп даёт 409 и не меняет время окончания', async () => {
    await start(ctx.app, annaId, 'Задача');
    ctx.clock.advance(20 * MINUTE);
    await stop(ctx.app, annaId);
    ctx.clock.advance(20 * MINUTE);

    const response = await stop(ctx.app, annaId);

    expect(response.statusCode).toBe(409);
    const row = ctx.db.prepare('SELECT ended_at FROM time_entries').get();
    expect(row).toEqual({ ended_at: Date.parse('2026-11-02T09:20:00.000Z') });
  });

  it.each([
    ['пустое описание', ''],
    ['описание из пробелов', '   '],
    ['слишком длинное описание', 'а'.repeat(LIMITS.taskMax + 1)],
  ])('старт отклоняется: %s', async (_case, task) => {
    const response = await start(ctx.app, annaId, task);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    expect(countEntries(ctx.db)).toBe(0);
  });

  it('старт без тела запроса отклоняется с 400', async () => {
    const response = await ctx.app.inject({ method: 'POST', url: `/api/employees/${annaId}/timer/start` });
    expect(response.statusCode).toBe(400);
  });

  it('описание задачи другого типа не приводится к строке', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/employees/${annaId}/timer/start`,
      payload: { task: 42 },
    });
    expect(response.statusCode).toBe(400);
    expect(countEntries(ctx.db)).toBe(0);
  });

  it('несуществующий сотрудник: 404 на старт и на стоп', async () => {
    const started = await start(ctx.app, 999, 'Задача');
    const stopped = await stop(ctx.app, 999);

    expect(started.statusCode).toBe(404);
    expect(started.json()).toMatchObject({ error: 'EMPLOYEE_NOT_FOUND' });
    expect(stopped.statusCode).toBe(404);
    expect(stopped.json()).toMatchObject({ error: 'EMPLOYEE_NOT_FOUND' });
  });

  it.each(['abc', '0', '-1', '1.5', '01', '1e3', '9'.repeat(16)])('некорректный id сотрудника в пути (%s) даёт 400', async (id) => {
    const response = await start(ctx.app, id, 'Задача');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
  });

  it('таймеры разных сотрудников независимы', async () => {
    const boris = await addEmployee(ctx.app, 'Борис Пробный');
    await start(ctx.app, annaId, 'Задача Анны');
    ctx.clock.advance(MINUTE);
    expect((await start(ctx.app, boris.id, 'Задача Бориса')).statusCode).toBe(201);

    ctx.clock.advance(MINUTE);
    await stop(ctx.app, annaId);

    const [anna, borisNow] = await employees();
    expect(anna!.activeEntry).toBeNull();
    expect(borisNow!.activeEntry).toMatchObject({ task: 'Задача Бориса', endedAt: null });
  });

  it('время старта и стопа хранится с точностью до секунды', async () => {
    ctx.clock.set('2026-11-02T09:00:00.750Z');
    const started = (await start(ctx.app, annaId, 'Задача')).json();
    ctx.clock.set('2026-11-02T09:10:05.999Z');
    const stopped = (await stop(ctx.app, annaId)).json();

    expect(started.startedAt).toBe('2026-11-02T09:00:00.000Z');
    expect(stopped.endedAt).toBe('2026-11-02T09:10:05.000Z');
  });

  it('если часы ушли назад, стоп даёт нулевую длительность, а не ошибку', async () => {
    await start(ctx.app, annaId, 'Задача');
    ctx.clock.advance(-5 * MINUTE);

    const response = await stop(ctx.app, annaId);

    expect(response.statusCode).toBe(200);
    const entry = response.json();
    expect(entry.endedAt).toBe(entry.startedAt);
  });
});
