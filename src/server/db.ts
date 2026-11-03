import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

export const IN_MEMORY = ':memory:';

export const BUSY_TIMEOUT_MS = 5000;

// Каждая миграция выполняется один раз. Номер последней применённой хранится в PRAGMA user_version,
// поэтому новые изменения схемы добавляются в конец списка, а старые не редактируются.
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE employees (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE time_entries (
    id          INTEGER PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    task        TEXT    NOT NULL,
    started_at  INTEGER NOT NULL, -- UTC, мс
    ended_at    INTEGER,          -- NULL: таймер идёт
    CHECK (ended_at IS NULL OR ended_at >= started_at)
  );

  CREATE INDEX time_entries_started_at ON time_entries(started_at);

  -- У сотрудника не больше одного идущего таймера, даже если два запроса на старт придут одновременно.
  CREATE UNIQUE INDEX one_running_timer
    ON time_entries(employee_id)
    WHERE ended_at IS NULL;
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Открывает базу по пути к файлу (или IN_MEMORY для тестов) и доводит схему до последней версии. */
export function openDb(path: string): Db {
  if (path !== IN_MEMORY) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  // Второе соединение (например, npm run seed при запущенном сервере) ненадолго блокирует файл.
  // Без ожидания запрос сразу падал бы с «database is locked» и превращался в 500.
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
