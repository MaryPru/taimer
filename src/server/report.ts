import { floorToSecond } from '../shared/time.js';
import type { Employee, EmployeeReport, Report } from '../shared/types.js';
import type { Db } from './db.js';
import { shareInPeriod, type Period } from './period.js';
import { toTimeEntry, type TimeEntryRow } from './rows.js';

export function buildReport(db: Db, period: Period, now: number): Report {
  const employees = db.prepare('SELECT id, name FROM employees ORDER BY id').all() as unknown as Employee[];

  // SQL отбирает кандидатов грубо (с запасом на границах), точное решение принимает shareInPeriod.
  const rows = db
    .prepare(
      `SELECT * FROM time_entries
       WHERE started_at < :to AND (ended_at IS NULL OR ended_at >= :from)
       ORDER BY started_at, id`,
    )
    .all({ from: period.from, to: period.to }) as unknown as TimeEntryRow[];

  const byEmployee = new Map<number, EmployeeReport>(
    employees.map((employee) => [employee.id, { ...employee, totalMs: 0, entries: [] }]),
  );

  for (const row of rows) {
    // Идущий таймер считаем до текущего момента. max на случай, если часы ушли назад после старта.
    const end = row.ended_at ?? Math.max(now, row.started_at);
    const share = shareInPeriod(row.started_at, end, period);
    const employee = byEmployee.get(row.employee_id);
    if (share === null || !employee) continue;

    // Целые секунды и для границ периода с миллисекундами: итог должен совпадать с суммой строк.
    const durationMs = floorToSecond(share);
    employee.entries.push({ ...toTimeEntry(row), durationMs });
    employee.totalMs += durationMs;
  }

  const result = [...byEmployee.values()];
  return {
    from: new Date(period.from).toISOString(),
    to: new Date(period.to).toISOString(),
    generatedAt: new Date(now).toISOString(),
    totalMs: result.reduce((sum, employee) => sum + employee.totalMs, 0),
    employees: result,
  };
}
