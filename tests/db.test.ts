import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUSY_TIMEOUT_MS, IN_MEMORY, SCHEMA_VERSION, openDb, type Db } from '../src/server/db.js';

function insertEmployee(db: Db, name: string): number {
  const { lastInsertRowid } = db.prepare('INSERT INTO employees (name, created_at) VALUES (?, ?)').run(name, 0);
  return Number(lastInsertRowid);
}

function insertEntry(db: Db, employeeId: number, endedAt: number | null): void {
  db.prepare('INSERT INTO time_entries (employee_id, task, started_at, ended_at) VALUES (?, ?, ?, ?)').run(
    employeeId,
    'Задача',
    0,
    endedAt,
  );
}

describe('схема базы', () => {
  it('создаётся на пустой базе', () => {
    const db = openDb(IN_MEMORY);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
    expect(tables.map((t) => t.name)).toEqual(['employees', 'time_entries']);
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: SCHEMA_VERSION });
    db.close();
  });

  it('не даёт сотруднику два идущих таймера', () => {
    const db = openDb(IN_MEMORY);
    const id = insertEmployee(db, 'Анна Тестова');
    insertEntry(db, id, null);
    expect(() => insertEntry(db, id, null)).toThrow(/UNIQUE constraint failed/);
    db.close();
  });

  it('разрешает завершённые записи рядом с идущей и таймеры разных сотрудников', () => {
    const db = openDb(IN_MEMORY);
    const first = insertEmployee(db, 'Анна Тестова');
    const second = insertEmployee(db, 'Борис Пробный');
    insertEntry(db, first, 1000);
    insertEntry(db, first, null);
    insertEntry(db, second, null);
    expect(db.prepare('SELECT count(*) AS n FROM time_entries').get()).toEqual({ n: 3 });
    db.close();
  });

  it('ждёт освобождения файла, а не падает сразу с «database is locked»', () => {
    const db = openDb(IN_MEMORY);
    expect(db.prepare('PRAGMA busy_timeout').get()).toEqual({ timeout: BUSY_TIMEOUT_MS });
    db.close();
  });

  it('не принимает запись несуществующего сотрудника', () => {
    const db = openDb(IN_MEMORY);
    expect(() => insertEntry(db, 999, null)).toThrow(/FOREIGN KEY constraint failed/);
    db.close();
  });
});

describe('файл базы', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'taimer-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('создаёт папку и сохраняет данные между открытиями, миграции повторно не применяются', () => {
    const path = join(dir, 'nested', 'taimer.db');

    const first = openDb(path);
    insertEmployee(first, 'Анна Тестова');
    first.close();

    const second = openDb(path);
    expect(second.prepare('SELECT name FROM employees').all()).toEqual([{ name: 'Анна Тестова' }]);
    expect(second.prepare('PRAGMA user_version').get()).toEqual({ user_version: SCHEMA_VERSION });
    second.close();
  });
});
