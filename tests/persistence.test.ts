import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app.js';
import { openDb } from '../src/server/db.js';
import type { EmployeeWithTimer, Report } from '../src/shared/types.js';
import { addEmployee, getReport, HOUR, MINUTE, start, stop, TestClock } from './helpers.js';

// Перезапуск сервера целиком: приложение и база закрываются, затем открываются заново на том же файле.
describe('данные после перезапуска сервера', () => {
  let dir: string;
  let dbPath: string;
  const clock = new TestClock(Date.parse('2026-11-02T09:00:00.000Z'));

  async function launch() {
    const db = openDb(dbPath);
    const app = await buildApp({ db, now: clock.now });
    return {
      app,
      async shutdown() {
        await app.close();
        db.close();
      },
    };
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'taimer-'));
    dbPath = join(dir, 'taimer.db');
    clock.set('2026-11-02T09:00:00.000Z');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('сотрудники, записи и идущий таймер на месте, таймер считает время простоя', async () => {
    const before = await launch();
    const anna = await addEmployee(before.app, 'Анна Тестова');
    const boris = await addEmployee(before.app, 'Борис Пробный');
    await start(before.app, anna.id, 'Код-ревью');
    clock.advance(30 * MINUTE);
    await stop(before.app, anna.id);
    const running = await start(before.app, boris.id, 'Вёрстка формы');
    clock.advance(15 * MINUTE);
    await before.shutdown();

    // Сервер лежал час. Таймер Бориса всё это время шёл.
    clock.advance(HOUR);
    const after = await launch();

    const employees: EmployeeWithTimer[] = (await after.app.inject({ method: 'GET', url: '/api/employees' })).json();
    expect(employees.map((employee) => employee.name)).toEqual(['Анна Тестова', 'Борис Пробный']);
    expect(employees[0]!.activeEntry).toBeNull();
    expect(employees[1]!.activeEntry).toEqual(running.json());

    const report: Report = (await getReport(after.app, '2026-11-02T00:00:00Z', '2026-11-03T00:00:00Z')).json();
    expect(report.employees.map((employee) => employee.totalMs)).toEqual([30 * MINUTE, HOUR + 15 * MINUTE]);

    const stopped = await stop(after.app, boris.id);
    expect(stopped.statusCode).toBe(200);
    expect(stopped.json()).toMatchObject({ task: 'Вёрстка формы', endedAt: '2026-11-02T10:45:00.000Z' });
    await after.shutdown();
  });

  it('запрет второго таймера действует и после перезапуска', async () => {
    const before = await launch();
    const anna = await addEmployee(before.app, 'Анна Тестова');
    await start(before.app, anna.id, 'Код-ревью');
    await before.shutdown();

    const after = await launch();
    const second = await start(after.app, anna.id, 'Другая задача');
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: 'TIMER_ALREADY_RUNNING' });
    await after.shutdown();
  });
});
