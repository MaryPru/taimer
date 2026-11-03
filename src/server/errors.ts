import type { FastifyError, FastifyInstance } from 'fastify';
import type { ApiError, ApiErrorCode } from '../shared/types.js';

/** Ожидаемая ошибка предметной области: превращается в ответ с нужным статусом и кодом. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const employeeNotFound = (id: number) =>
  new AppError(404, 'EMPLOYEE_NOT_FOUND', `Сотрудник с id ${id} не найден`);

/** Обрезает пробелы по краям и проверяет длину. Возвращает очищенную строку. */
export function requireText(value: string, field: string, max: number): string {
  const text = value.trim();
  if (text === '') throw new AppError(400, 'VALIDATION_ERROR', `${field}: поле не может быть пустым`);
  if (text.length > max) throw new AppError(400, 'VALIDATION_ERROR', `${field}: не длиннее ${max} символов`);
  return text;
}

/** Все ошибки API отдаются в одном формате { error, message }. */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(body(error.code, error.message));
    }
    if (error.validation) {
      return reply.status(400).send(body('VALIDATION_ERROR', `Некорректный запрос: ${error.message}`));
    }
    // Ошибки самого Fastify уровня 4xx: пустое или битое JSON-тело, неверный Content-Type и т. п.
    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send(body('BAD_REQUEST', error.message));
    }
    request.log.error(error);
    return reply.status(500).send(body('INTERNAL_ERROR', 'Внутренняя ошибка сервера'));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(body('NOT_FOUND', `Маршрут ${request.method} ${request.url} не найден`));
  });
}

function body(error: ApiErrorCode, message: string): ApiError {
  return { error, message };
}
