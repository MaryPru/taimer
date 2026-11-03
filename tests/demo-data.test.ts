import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { IN_MEMORY, openDb, type Db } from '../src/server/db.js';
import { seedDemoData } from '../src/server/demo-data.js';
import type { Report } from '../src/shared/types.js';
import { getReport, HOUR, TestClock } from './helpers.js';

interface EntryRow {
  employee_id: number;
  started_at: number;
  ended_at: number | null;
}

// Среда, середина рабочего дня.
const now = Date.parse('2026-11-04T13:00:00.000Z');

describe('демо-данные (npm run seed)', () => {
  let db: Db;

  beforeEach(() => {
    db = openDb(IN_MEMORY);
  });

  afterEach(() => {
    db.close();
  });

  const entries = () =>
    db.prepare('SELECT employee_id, started_at, ended_at FROM time_entries ORDER BY employee_id, started_at').all() as unknown as EntryRow[];

  it('создаёт сотрудников и записи, у двух сотрудников идёт таймер', () => {
    const result = seedDemoData(db, now);

    expect(result.employees).toBe(5);
    expect(result.running).toBe(2);
    expect(entries()).toHaveLength(result.entries);
    expect(result.entries).toBeGreaterThan(30);
    expect(entries().filter((entry) => entry.ended_at === null).map((entry) => entry.employee_id)).toEqual([1, 2]);
  });

  it('записи не пересекаются, не уходят в будущее и хранятся в целых секундах, как пишет сервер', () => {
    seedDemoData(db, now);

    let previous: EntryRow | undefined;
    for (const entry of entries()) {
      expect(entry.started_at % 1000).toBe(0);
      expect(entry.started_at).toBeLessThanOrEqual(now);
      if (entry.ended_at !== null) {
        expect(entry.ended_at % 1000).toBe(0);
        expect(entry.ended_at).toBeGreaterThan(entry.started_at);
        expect(entry.ended_at).toBeLessThanOrEqual(now);
      }
      if (previous?.employee_id === entry.employee_id) {
        expect(previous.ended_at).not.toBeNull();
        expect(entry.started_at).toBeGreaterThanOrEqual(previous.ended_at!);
      }
      previous = entry;
    }
  });

  it('при одном и том же now данные одинаковые', () => {
    seedDemoData(db, now);
    const other = openDb(IN_MEMORY);
    seedDemoData(other, now);

    const all = (target: Db) => target.prepare('SELECT employee_id, task, started_at, ended_at FROM time_entries ORDER BY id').all();
    expect(all(other)).toEqual(all(db));
    other.close();
  });

  it('не трогает базу, в которой уже есть сотрудники', () => {
    db.prepare('INSERT INTO employees (name, created_at) VALUES (?, ?)').run('Анна Тестова', now);

    expect(() => seedDemoData(db, now)).toThrow(/уже есть сотрудники/);
    expect(db.prepare('SELECT count(*) AS count FROM employees').get()).toEqual({ count: 1 });
    expect(entries()).toEqual([]);
  });

  it('отчёт за неделю по демо-данным заполнен у всех сотрудников', async () => {
    seedDemoData(db, now);
    const app = await buildApp({ db, now: new TestClock(now).now });

    const response = await getReport(app, new Date(now - 7 * 24 * HOUR).toISOString(), new Date(now).toISOString());
    const report: Report = response.json();

    expect(response.statusCode).toBe(200);
    expect(report.employees).toHaveLength(5);
    for (const employee of report.employees) expect(employee.totalMs).toBeGreaterThan(HOUR);
    await app.close();
  });
});
