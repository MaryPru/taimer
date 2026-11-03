import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Report } from '../src/shared/types.js';
import { addEmployee, addEntry, createTestApp, getReport, HOUR, MINUTE, type TestContext } from './helpers.js';

const NOW = '2026-11-10T12:00:00.000Z';
// Девятое ноября по UTC.
const DAY_FROM = '2026-11-09T00:00:00.000Z';
const DAY_TO = '2026-11-10T00:00:00.000Z';

describe('отчёт за период', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp(NOW);
  });

  afterEach(async () => {
    await ctx.close();
  });

  async function report(from: string, to: string): Promise<Report> {
    const response = await getReport(ctx.app, from, to);
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  describe('пустой отчёт', () => {
    it('нет ни сотрудников, ни записей', async () => {
      expect(await report(DAY_FROM, DAY_TO)).toEqual({
        from: DAY_FROM,
        to: DAY_TO,
        generatedAt: NOW,
        totalMs: 0,
        employees: [],
      });
    });

    it('сотрудники есть, но за период ничего не записано', async () => {
      const anna = await addEmployee(ctx.app, 'Анна Тестова');
      const boris = await addEmployee(ctx.app, 'Борис Пробный');
      await addEntry(ctx, anna.id, 'Вне периода', '2026-11-07T09:00:00Z', '2026-11-07T10:00:00Z');
      ctx.clock.set(NOW);

      const result = await report(DAY_FROM, DAY_TO);

      expect(result.totalMs).toBe(0);
      expect(result.employees).toEqual([
        { id: anna.id, name: 'Анна Тестова', totalMs: 0, entries: [] },
        { id: boris.id, name: 'Борис Пробный', totalMs: 0, entries: [] },
      ]);
    });
  });

  it('считает итог каждого сотрудника и общий итог, обрезая записи по границам периода', async () => {
    const anna = await addEmployee(ctx.app, 'Анна Тестова');
    const boris = await addEmployee(ctx.app, 'Борис Пробный');
    const vera = await addEmployee(ctx.app, 'Вера Образцова');
    await addEntry(ctx, anna.id, 'Код-ревью', '2026-11-09T14:00:00Z', '2026-11-09T15:00:00Z');
    await addEntry(ctx, anna.id, 'Планирование', '2026-11-09T09:00:00Z', '2026-11-09T10:30:00Z');
    await addEntry(ctx, boris.id, 'Ночной релиз', '2026-11-08T23:00:00Z', '2026-11-09T01:00:00Z');
    await addEntry(ctx, boris.id, 'Дежурство', '2026-11-09T23:30:00Z', '2026-11-10T00:30:00Z');
    await addEntry(ctx, vera.id, 'Прошлая неделя', '2026-11-02T09:00:00Z', '2026-11-02T18:00:00Z');
    ctx.clock.set(NOW);

    const result = await report(DAY_FROM, DAY_TO);

    const [annaReport, borisReport, veraReport] = result.employees;
    // Записи идут по времени начала, а не по порядку создания.
    expect(annaReport!.entries.map((e) => [e.task, e.durationMs])).toEqual([
      ['Планирование', 90 * MINUTE],
      ['Код-ревью', HOUR],
    ]);
    expect(annaReport!.totalMs).toBe(150 * MINUTE);

    // Через начало периода попадает час из двух, через конец полчаса из часа.
    expect(borisReport!.entries.map((e) => [e.task, e.durationMs])).toEqual([
      ['Ночной релиз', HOUR],
      ['Дежурство', 30 * MINUTE],
    ]);
    // Сами записи отдаются целиком, обрезается только длительность.
    expect(borisReport!.entries[0]).toMatchObject({
      startedAt: '2026-11-08T23:00:00.000Z',
      endedAt: '2026-11-09T01:00:00.000Z',
    });
    expect(borisReport!.totalMs).toBe(90 * MINUTE);

    expect(veraReport).toEqual({ id: vera.id, name: 'Вера Образцова', totalMs: 0, entries: [] });
    expect(result.totalMs).toBe(4 * HOUR);
  });

  it('итог совпадает с суммой строк в целых секундах, даже если границы периода с миллисекундами', async () => {
    const anna = await addEmployee(ctx.app, 'Анна Тестова');
    await addEntry(ctx, anna.id, 'Через начало', '2026-11-09T08:59:50Z', '2026-11-09T09:00:10Z');
    await addEntry(ctx, anna.id, 'Через конец', '2026-11-09T10:00:00Z', '2026-11-09T10:00:05Z');
    ctx.clock.set(NOW);

    // Без округления строки были бы 9,5 с и 0,5 с: на экране 0:00:09 и 0:00:00, а в итоге 0:00:10.
    const result = await report('2026-11-09T09:00:00.500Z', '2026-11-09T10:00:00.500Z');

    const durations = result.employees[0]!.entries.map((entry) => entry.durationMs);
    expect(durations).toEqual([9_000, 0]);
    expect(result.totalMs).toBe(9_000);
  });

  it('не включает записи, которые только касаются границ периода', async () => {
    const anna = await addEmployee(ctx.app, 'Анна Тестова');
    await addEntry(ctx, anna.id, 'Закончилась в полночь', '2026-11-08T22:00:00Z', DAY_FROM);
    await addEntry(ctx, anna.id, 'Началась в полночь', DAY_TO, '2026-11-10T01:00:00Z');
    ctx.clock.set(NOW);

    const result = await report(DAY_FROM, DAY_TO);

    expect(result.employees[0]!.entries).toEqual([]);
    expect(result.totalMs).toBe(0);
  });

  describe('идущий таймер', () => {
    let annaId: number;

    beforeEach(async () => {
      annaId = (await addEmployee(ctx.app, 'Анна Тестова')).id;
      await addEntry(ctx, annaId, 'Идёт сейчас', '2026-11-10T10:00:00Z', null);
      ctx.clock.set(NOW);
    });

    it('считается до момента запроса', async () => {
      const result = await report('2026-11-10T00:00:00Z', '2026-11-11T00:00:00Z');

      expect(result.generatedAt).toBe(NOW);
      expect(result.employees[0]!.entries).toEqual([
        expect.objectContaining({ task: 'Идёт сейчас', endedAt: null, durationMs: 2 * HOUR }),
      ]);
      expect(result.totalMs).toBe(2 * HOUR);
    });

    it('обрезается концом периода, если период закончился раньше', async () => {
      const result = await report('2026-11-10T00:00:00Z', '2026-11-10T11:00:00Z');
      expect(result.totalMs).toBe(HOUR);
    });

    it('не попадает в будущий период', async () => {
      const result = await report('2026-11-11T00:00:00Z', '2026-11-12T00:00:00Z');
      expect(result.employees[0]!.entries).toEqual([]);
    });

    it('растёт со временем между запросами', async () => {
      ctx.clock.advance(15 * MINUTE);
      const result = await report('2026-11-10T00:00:00Z', '2026-11-11T00:00:00Z');
      expect(result.totalMs).toBe(2 * HOUR + 15 * MINUTE);
    });
  });

  it('учитывает часовой пояс периода: сутки по Москве начинаются в 21:00 UTC', async () => {
    const anna = await addEmployee(ctx.app, 'Анна Тестова');
    // 01:30–02:30 девятого ноября по Москве, но ещё восьмое по UTC.
    await addEntry(ctx, anna.id, 'Ночная задача', '2026-11-08T22:30:00Z', '2026-11-08T23:30:00Z');
    ctx.clock.set(NOW);

    const moscowDay = await report('2026-11-09T00:00:00+03:00', '2026-11-10T00:00:00+03:00');
    const utcDay = await report(DAY_FROM, DAY_TO);

    expect(moscowDay.from).toBe('2026-11-08T21:00:00.000Z');
    expect(moscowDay.totalMs).toBe(HOUR);
    expect(utcDay.totalMs).toBe(0);
  });

  describe('ошибки в параметрах', () => {
    it.each([
      ['нет from', '/api/report?to=2026-11-10T00:00:00Z'],
      ['нет to', '/api/report?from=2026-11-09T00:00:00Z'],
      ['нет параметров', '/api/report'],
      ['from передан дважды', '/api/report?from=2026-11-09T00:00:00Z&from=2026-11-08T00:00:00Z&to=2026-11-10T00:00:00Z'],
      ['дата без времени', '/api/report?from=2026-11-09&to=2026-11-10'],
      ['несуществующая дата', '/api/report?from=2026-02-30T00:00:00Z&to=2026-03-05T00:00:00Z'],
      ['from позже to', '/api/report?from=2026-11-10T00:00:00Z&to=2026-11-09T00:00:00Z'],
    ])('%s: 400', async (_case, url) => {
      const response = await ctx.app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    });

    it('незакодированный «+» в часовом поясе: 400 с подсказкой, закодированный работает', async () => {
      const raw = await ctx.app.inject({
        method: 'GET',
        url: '/api/report?from=2026-11-09T00:00:00+03:00&to=2026-11-10T00:00:00+03:00',
      });
      const encoded = await ctx.app.inject({
        method: 'GET',
        url: '/api/report?from=2026-11-09T00:00:00%2B03:00&to=2026-11-10T00:00:00%2B03:00',
      });

      expect(raw.statusCode).toBe(400);
      expect(raw.json().message).toMatch(/%2B/);
      expect(encoded.statusCode).toBe(200);
    });
  });
});
