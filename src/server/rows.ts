import type { TimeEntry } from '../shared/types.js';

/** Строка таблицы time_entries в том виде, как её возвращает SQLite. */
export interface TimeEntryRow {
  id: number;
  employee_id: number;
  task: string;
  started_at: number;
  ended_at: number | null;
}

export function toTimeEntry(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    employeeId: row.employee_id,
    task: row.task,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: row.ended_at === null ? null : new Date(row.ended_at).toISOString(),
  };
}
