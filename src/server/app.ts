import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { floorToSecond } from '../shared/time.js';
import type { Db } from './db.js';
import { AppError, registerErrorHandlers } from './errors.js';
import { registerRoutes } from './routes.js';

export interface AppOptions {
  db: Db;
  /** Текущее время в мс. В тестах подменяется управляемыми часами. */
  now?: () => number;
  /** Папка со сборкой клиента. Без неё сервер отдаёт только API (так работают тесты и режим разработки). */
  webDir?: string;
  logger?: FastifyServerOptions['logger'];
}

/** Собирает приложение без запуска на порту, чтобы тесты могли гонять запросы через app.inject(). */
export async function buildApp({ db, now = Date.now, webDir, logger = false }: AppOptions): Promise<FastifyInstance> {
  // Fastify по умолчанию приводит типы: { name: true } превратился бы в сотрудника с именем "true".
  // Отключаем приведение, параметры пути разбираем сами (см. idParams в routes.ts).
  const app = Fastify({ logger, ajv: { customOptions: { coerceTypes: false } } });

  registerErrorHandlers(app);
  requireUtf8Json(app);
  // Старт, стоп и «сейчас» в отчёте фиксируются с точностью до секунды (см. floorToSecond).
  registerRoutes(app, { db, now: () => floorToSecond(now()) });

  if (webDir) await app.register(fastifyStatic, { root: webDir });

  return app;
}

/**
 * JSON-тело читается строго как UTF-8. По умолчанию битые байты молча заменяются на «�», и в базу
 * попало бы имя «����». Так было при ручной проверке: curl в консоли Windows отправил имя в cp1251.
 * Сам разбор JSON остаётся стандартным, с защитой от __proto__ и constructor в теле.
 */
function requireUtf8Json(app: FastifyInstance): void {
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser<Buffer>('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    let text: string;
    try {
      text = utf8.decode(body);
    } catch {
      done(new AppError(400, 'BAD_REQUEST', 'Тело запроса должно быть в кодировке UTF-8'), undefined);
      return;
    }
    void parseJson(request, text, done);
  });
}
