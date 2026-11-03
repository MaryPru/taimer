// Типы запросов и ответов API. Общие для сервера и клиента.
// Время в API передаётся строками ISO 8601 в UTC, в базе хранится в миллисекундах.

export const LIMITS = {
  employeeNameMax: 100,
  taskMax: 200,
} as const;

export interface Employee {
  id: number;
  name: string;
}

export interface TimeEntry {
  id: number;
  employeeId: number;
  task: string;
  startedAt: string;
  /** null, пока таймер идёт. */
  endedAt: string | null;
}

export interface EmployeeWithTimer extends Employee {
  activeEntry: TimeEntry | null;
}

export interface ReportEntry extends TimeEntry {
  /** Сколько времени записи пришлось на период, мс. Идущий таймер считается до generatedAt. */
  durationMs: number;
}

export interface EmployeeReport extends Employee {
  totalMs: number;
  /** Записи, пересекающие период, по времени начала. */
  entries: ReportEntry[];
}

export interface Report {
  /** Начало периода, включительно. */
  from: string;
  /** Конец периода, не включительно. */
  to: string;
  /** Момент, до которого посчитаны идущие таймеры. */
  generatedAt: string;
  totalMs: number;
  /** Все сотрудники, включая тех, у кого за период нет записей. */
  employees: EmployeeReport[];
}

export interface CreateEmployeeRequest {
  name: string;
}

export interface StartTimerRequest {
  task: string;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'EMPLOYEE_NOT_FOUND'
  | 'TIMER_ALREADY_RUNNING'
  | 'TIMER_NOT_RUNNING'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR';

export interface ApiError {
  error: ApiErrorCode;
  message: string;
}
