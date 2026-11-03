import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server/app.js';
import { IN_MEMORY, openDb, type Db } from '../src/server/db.js';
import type { Employee } from '../src/shared/types.js';

/** Часы, которые двигаются только по команде теста. */
export class TestClock {
  constructor(private current: number) {}

  now = (): number => this.current;

  advance(ms: number): void {
    this.current += ms;
  }

  set(iso: string): void {
    this.current = Date.parse(iso);
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  clock: TestClock;
  close(): Promise<void>;
}

export async function createTestApp(startAt = '2026-11-02T09:00:00.000Z'): Promise<TestContext> {
  const db = openDb(IN_MEMORY);
  const clock = new TestClock(Date.parse(startAt));
  const app = await buildApp({ db, now: clock.now });
  return {
    app,
    db,
    clock,
    async close() {
      await app.close();
      db.close();
    },
  };
}

export async function addEmployee(app: FastifyInstance, name: string): Promise<Employee> {
  const response = await app.inject({ method: 'POST', url: '/api/employees', payload: { name } });
  if (response.statusCode !== 201) throw new Error(`Не удалось создать сотрудника: ${response.body}`);
  return response.json();
}

export function start(app: FastifyInstance, employeeId: number | string, task: string) {
  return app.inject({ method: 'POST', url: `/api/employees/${employeeId}/timer/start`, payload: { task } });
}

export function stop(app: FastifyInstance, employeeId: number | string) {
  return app.inject({ method: 'POST', url: `/api/employees/${employeeId}/timer/stop` });
}

/** Создаёт запись через API: двигает часы на старт, запускает, двигает на конец, останавливает. */
export async function addEntry(
  ctx: TestContext,
  employeeId: number,
  task: string,
  startedAt: string,
  endedAt: string | null,
): Promise<void> {
  ctx.clock.set(startedAt);
  const started = await start(ctx.app, employeeId, task);
  if (started.statusCode !== 201) throw new Error(`Не удалось запустить таймер: ${started.body}`);
  if (endedAt === null) return;
  ctx.clock.set(endedAt);
  const stopped = await stop(ctx.app, employeeId);
  if (stopped.statusCode !== 200) throw new Error(`Не удалось остановить таймер: ${stopped.body}`);
}

/** Запрос отчёта; query кодируется, поэтому «+» в часовом поясе доходит как есть. */
export function getReport(app: FastifyInstance, from: string, to: string) {
  return app.inject({ method: 'GET', url: '/api/report', query: { from, to } });
}

export function countEntries(db: Db): number {
  return (db.prepare('SELECT count(*) AS n FROM time_entries').get() as { n: number }).n;
}
