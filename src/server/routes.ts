import type { FastifyInstance } from 'fastify';
import type { CreateEmployeeRequest, StartTimerRequest } from '../shared/types.js';
import type { Db } from './db.js';
import { createEmployee, listEmployees } from './employees.js';
import { parsePeriod } from './period.js';
import { buildReport } from './report.js';
import { startTimer, stopTimer } from './timer.js';

interface RouteDeps {
  db: Db;
  now: () => number;
}

// Схемы проверяют только форму запроса. Содержимое (пустые строки, длина) проверяют сервисы,
// чтобы правила и тексты ошибок жили в одном месте.

// Параметры пути всегда приходят строкой, а приведение типов отключено, поэтому id проверяем шаблоном.
// Не больше 15 цифр: такие числа точно представимы в JS.
const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: '^[1-9][0-9]{0,14}$' } },
} as const;

type IdParams = { id: string };

const periodQuery = {
  type: 'object',
  required: ['from', 'to'],
  properties: { from: { type: 'string' }, to: { type: 'string' } },
} as const;

type PeriodQuery = { from: string; to: string };

const stringField = (name: string) =>
  ({
    type: 'object',
    required: [name],
    properties: { [name]: { type: 'string' } },
  }) as const;

export function registerRoutes(app: FastifyInstance, { db, now }: RouteDeps): void {
  app.get('/api/health', async () => {
    db.prepare('SELECT 1').get();
    return { status: 'ok' };
  });

  app.get('/api/employees', async () => listEmployees(db));

  app.post<{ Body: CreateEmployeeRequest }>(
    '/api/employees',
    { schema: { body: stringField('name') } },
    async (request, reply) => reply.status(201).send(createEmployee(db, request.body.name, now())),
  );

  app.post<{ Params: IdParams; Body: StartTimerRequest }>(
    '/api/employees/:id/timer/start',
    { schema: { params: idParams, body: stringField('task') } },
    async (request, reply) =>
      reply.status(201).send(startTimer(db, Number(request.params.id), request.body.task, now())),
  );

  app.post<{ Params: IdParams }>(
    '/api/employees/:id/timer/stop',
    { schema: { params: idParams } },
    async (request) => stopTimer(db, Number(request.params.id), now()),
  );

  app.get<{ Querystring: PeriodQuery }>(
    '/api/report',
    { schema: { querystring: periodQuery } },
    async (request) => buildReport(db, parsePeriod(request.query.from, request.query.to), now()),
  );
}
