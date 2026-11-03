import type { ApiError, Employee, EmployeeWithTimer, Report, TimeEntry } from '../shared/types.js';
import { observeServerTime } from './serverClock';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  // Заголовок только при наличии тела: на Content-Type: application/json с пустым телом Fastify отвечает 400.
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiRequestError(0, 'NETWORK', 'Сервер не отвечает. Проверьте, что он запущен, и попробуйте ещё раз');
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data as Partial<ApiError> | null;
    throw new ApiRequestError(
      response.status,
      error?.error ?? 'HTTP_ERROR',
      error?.message ?? `Сервер ответил ошибкой ${response.status}`,
    );
  }
  return data as T;
}

// Старт, стоп и отчёт возвращают «сейчас» сервера: по нему сверяем часы (см. serverClock.ts).
export const api = {
  listEmployees: () => request<EmployeeWithTimer[]>('GET', '/api/employees'),
  createEmployee: (name: string) => request<Employee>('POST', '/api/employees', { name }),
  startTimer: async (employeeId: number, task: string) => {
    const entry = await request<TimeEntry>('POST', `/api/employees/${employeeId}/timer/start`, { task });
    observeServerTime(entry.startedAt);
    return entry;
  },
  stopTimer: async (employeeId: number) => {
    const entry = await request<TimeEntry>('POST', `/api/employees/${employeeId}/timer/stop`);
    if (entry.endedAt) observeServerTime(entry.endedAt);
    return entry;
  },
  // URLSearchParams кодирует «+» в часовом поясе как %2B, иначе сервер получил бы пробел.
  getReport: async (from: string, to: string) => {
    const report = await request<Report>('GET', `/api/report?${new URLSearchParams({ from, to })}`);
    observeServerTime(report.generatedAt);
    return report;
  },
};

/** Сервер не ответил вовсе (выключен, нет сети), в отличие от ответа с кодом ошибки. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 0;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return 'Что-то пошло не так. Обновите страницу и попробуйте ещё раз';
}
