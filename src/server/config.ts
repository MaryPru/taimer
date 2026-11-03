import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Пути по умолчанию считаем от этого файла, а не от текущей папки терминала.
// src/server и dist/server лежат на одной глубине, поэтому корень проекта в обоих случаях на два уровня выше.
export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Файл базы: DB_PATH или data/taimer.db в корне проекта. Пустой DB_PATH считается незаданным:
 * new DatabaseSync('') открыл бы временную базу, и данные молча пропадали бы при перезапуске.
 * Относительный путь считается от текущей папки, как у любой команды, и сразу делается абсолютным,
 * чтобы в сообщении при запуске было видно, какой файл открыт.
 */
export function resolveDbPath(value: string | undefined): string {
  return value?.trim() ? resolve(value) : join(projectRoot, 'data', 'taimer.db');
}

/** Его же заполняет npm run seed. */
export const dbPath = resolveDbPath(process.env.DB_PATH);
