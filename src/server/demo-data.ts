import { addDays, floorToSecond, startOfDay } from '../shared/time.js';
import type { Db } from './db.js';

// Только вымышленные люди и задачи.
const EMPLOYEES = ['Анна Тестова', 'Борис Пробный', 'Вера Образцова', 'Григорий Демонстрационный', 'Дарья Макетова'];

const TASKS = [
  'Код-ревью',
  'Вёрстка формы отчёта',
  'Планёрка',
  'Исправление ошибок в таймере',
  'Тесты для отчёта',
  'Документация API',
  'Разбор входящих задач',
  'Настройка сборки',
  'Макет карточки сотрудника',
  'Созвон по требованиям',
];

const DAYS_BACK = 14;
const MINUTE = 60_000;

export interface SeedResult {
  employees: number;
  entries: number;
  running: number;
}

/**
 * Заполняет пустую базу демо-данными за две недели до now: рабочие дни с 9–10 утра,
 * 2–4 задачи в день без пересечений, у двух сотрудников таймер идёт прямо сейчас.
 * Случайность с постоянным зерном, поэтому при одном и том же now данные одинаковые.
 */
export function seedDemoData(db: Db, now: number): SeedResult {
  const { count } = db.prepare('SELECT count(*) AS count FROM employees').get() as { count: number };
  if (count > 0) {
    throw new Error('В базе уже есть сотрудники. Демо-данные пишутся только в пустую базу: удалите файл базы или укажите другой DB_PATH.');
  }

  const random = mulberry32(2026);
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pickTask = () => TASKS[Math.floor(random() * TASKS.length)]!;

  const insertEmployee = db.prepare('INSERT INTO employees (name, created_at) VALUES (?, ?)');
  const insertEntry = db.prepare('INSERT INTO time_entries (employee_id, task, started_at, ended_at) VALUES (?, ?, ?, ?)');
  const today = startOfDay(new Date(now));
  const result: SeedResult = { employees: 0, entries: 0, running: 0 };

  db.exec('BEGIN');
  try {
    EMPLOYEES.forEach((name, index) => {
      const id = Number(insertEmployee.run(name, addDays(today, -DAYS_BACK - 1).getTime()).lastInsertRowid);
      result.employees++;
      // У первых двух таймер идёт сейчас, их прошлые записи заканчиваются до его старта.
      const runningSince = index < 2 ? floorToSecond(now - between(20, 90) * MINUTE) : null;
      const limit = runningSince ?? now;

      for (let back = DAYS_BACK; back >= 0; back--) {
        const day = addDays(today, -back);
        if (day.getDay() === 0 || day.getDay() === 6) continue;
        // setHours, а не «полночь + 9 часов»: в день перевода часов это было бы 8:00 или 10:00.
        day.setHours(9, between(0, 59));
        let cursor = day.getTime();
        for (let task = between(2, 4); task > 0; task--) {
          const end = cursor + between(30, 150) * MINUTE;
          if (end > limit) break;
          insertEntry.run(id, pickTask(), cursor, end);
          result.entries++;
          cursor = end + between(5, 30) * MINUTE;
        }
      }

      if (runningSince !== null) {
        insertEntry.run(id, pickTask(), runningSince, null);
        result.entries++;
        result.running++;
      }
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return result;
}

/** Небольшой генератор псевдослучайных чисел с зерном: Math.random зерна не принимает. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
