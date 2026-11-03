import { collapseSpaces } from '../shared/names.js';
import { LIMITS, type Employee, type EmployeeWithTimer } from '../shared/types.js';
import type { Db } from './db.js';
import { requireText } from './errors.js';
import { toTimeEntry } from './rows.js';

interface EmployeeListRow {
  id: number;
  name: string;
  entry_id: number | null;
  task: string | null;
  started_at: number | null;
}

export function createEmployee(db: Db, rawName: string, now: number): Employee {
  const name = requireText(collapseSpaces(rawName), 'Имя сотрудника', LIMITS.employeeNameMax);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO employees (name, created_at) VALUES (?, ?)')
    .run(name, now);
  return { id: Number(lastInsertRowid), name };
}

export function employeeExists(db: Db, id: number): boolean {
  return db.prepare('SELECT 1 FROM employees WHERE id = ?').get(id) !== undefined;
}

/** Сотрудники в порядке добавления, у каждого идущий таймер или null. */
export function listEmployees(db: Db): EmployeeWithTimer[] {
  const rows = db
    .prepare(
      `SELECT e.id, e.name, t.id AS entry_id, t.task, t.started_at
       FROM employees e
       LEFT JOIN time_entries t ON t.employee_id = e.id AND t.ended_at IS NULL
       ORDER BY e.id`,
    )
    .all() as unknown as EmployeeListRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    activeEntry:
      row.entry_id === null
        ? null
        : toTimeEntry({
            id: row.entry_id,
            employee_id: row.id,
            task: row.task!,
            started_at: row.started_at!,
            ended_at: null,
          }),
  }));
}
