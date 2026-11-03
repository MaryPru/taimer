import { LIMITS, type TimeEntry } from '../shared/types.js';
import type { Db } from './db.js';
import { employeeExists } from './employees.js';
import { AppError, employeeNotFound, requireText } from './errors.js';
import { toTimeEntry, type TimeEntryRow } from './rows.js';

// Код SQLite для нарушения уникального индекса (SQLITE_CONSTRAINT_UNIQUE).
const SQLITE_CONSTRAINT_UNIQUE = 2067;

export function startTimer(db: Db, employeeId: number, rawTask: string, now: number): TimeEntry {
  const task = requireText(rawTask, 'Описание задачи', LIMITS.taskMax);
  if (!employeeExists(db, employeeId)) throw employeeNotFound(employeeId);

  // Не проверяем «уже идёт» отдельным SELECT: между проверкой и вставкой может проскочить второй запрос.
  // Правило держит уникальный индекс one_running_timer, а его нарушение мы переводим в 409.
  try {
    const row = db
      .prepare(
        `INSERT INTO time_entries (employee_id, task, started_at, ended_at)
         VALUES (?, ?, ?, NULL)
         RETURNING *`,
      )
      .get(employeeId, task, now) as unknown as TimeEntryRow;
    return toTimeEntry(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'TIMER_ALREADY_RUNNING', 'Таймер уже запущен. Остановите его, прежде чем начать новую задачу');
    }
    throw error;
  }
}

export function stopTimer(db: Db, employeeId: number, now: number): TimeEntry {
  // max(?, started_at): если системные часы ушли назад, запись получит нулевую длительность,
  // а не упадёт на CHECK (ended_at >= started_at).
  const row = db
    .prepare(
      `UPDATE time_entries
       SET ended_at = max(?, started_at)
       WHERE employee_id = ? AND ended_at IS NULL
       RETURNING *`,
    )
    .get(now, employeeId) as unknown as TimeEntryRow | undefined;

  if (row) return toTimeEntry(row);
  if (!employeeExists(db, employeeId)) throw employeeNotFound(employeeId);
  throw new AppError(409, 'TIMER_NOT_RUNNING', 'Таймер не запущен');
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && (error as { errcode?: number }).errcode === SQLITE_CONSTRAINT_UNIQUE;
}
