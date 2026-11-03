// Работа со временем на стороне клиента: формат длительности, границы периода в поясе браузера,
// быстрые периоды и досчёт идущих таймеров. Чистые функции, чтобы их можно было проверить тестами.
import type { Report } from './types.js';

/** Период по календарным дням включительно, в формате <input type="date">: YYYY-MM-DD. */
export interface DateRange {
  fromDate: string;
  toDate: string;
}

export type Preset = 'today' | 'week' | 'month';

/**
 * Выбор периода в отчёте. Пресет хранится как пресет, а не как даты: если страница открыта
 * через полночь, «Сегодня» само переходит на новый день.
 */
export type PeriodSelection = { preset: Preset } | { custom: DateRange };

const HOUR_MS = 3_600_000;

/** Таймер, который идёт дольше этого, скорее всего, забыли остановить. */
export const LONG_RUNNING_HOURS = 12;

export function isLongRunning(startedAt: string, now: number): boolean {
  return now - Date.parse(startedAt) >= LONG_RUNNING_HOURS * HOUR_MS;
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/**
 * Время учитывается целыми секундами. Если считать в миллисекундах, а показывать секунды,
 * итог отчёта расходится с суммой строк: 36,6 с + 176,7 с = 213,3 с, в строках 36 и 176, в итоге 213.
 */
export function floorToSecond(ms: number): number {
  return Math.floor(ms / 1000) * 1000;
}

/** Длительность в формате табеля «ч:мм:сс». Часы не ограничены сутками, отрицательное время даёт ноль. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}:${pad(minutes)}:${pad(totalSeconds % 60)}`;
}

/** Локальное время с явным смещением пояса, например 2026-11-02T00:00:00+03:00. Такой формат ждёт API. */
export function toLocalIso(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    `${toDateInput(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export function toDateInput(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** YYYY-MM-DD как локальная полночь. null для пустой строки и несуществующих дат вроде 2026-02-30. */
export function fromDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  // Не new Date(y, m, d): он считает годы 0–99 как 1900–1999.
  const date = new Date(0);
  date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setHours(0, 0, 0, 0);
  return toDateInput(date) === value ? date : null;
}

/**
 * Начало и конец записи для таблицы отчёта в поясе браузера: «02.11, 08:00» и «09:15».
 * Дата у конца пишется, только если запись перешла через полночь; год, только если он не текущий
 * (иначе период через Новый год читается неоднозначно). null у конца означает, что таймер идёт.
 * Без Intl.DateTimeFormat: он запоминает часовой пояс при создании, а getHours всегда берёт текущий.
 */
export function formatEntrySpan(
  startedAt: string,
  endedAt: string | null,
  now: Date,
): { start: string; end: string | null } {
  const start = new Date(startedAt);
  const time = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const dayTime = (date: Date) => {
    const year = date.getFullYear() === now.getFullYear() ? '' : `.${pad(date.getFullYear(), 4)}`;
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}${year}, ${time(date)}`;
  };
  if (endedAt === null) return { start: dayTime(start), end: null };
  const end = new Date(endedAt);
  return { start: dayTime(start), end: toDateInput(start) === toDateInput(end) ? time(end) : dayTime(end) };
}

/** Сдвиг на календарные дни. Не «+24 часа»: в дни перевода часов в сутках 23 или 25 часов. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Местная полночь того же дня. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Сколько миллисекунд до следующей местной полуночи: через неё «Сегодня» в отчёте сменится на новый день. */
export function msUntilNextDay(now: Date): number {
  return addDays(startOfDay(now), 1).getTime() - now.getTime();
}

/** Границы для API: полночь первого дня и полночь дня после последнего. null, если период задан неверно. */
export function rangeToPeriod(range: DateRange): { from: string; to: string } | null {
  const first = fromDateInput(range.fromDate);
  const last = fromDateInput(range.toDate);
  if (!first || !last || first > last) return null;
  return { from: toLocalIso(first), to: toLocalIso(addDays(last, 1)) };
}

/** Сегодня, текущая неделя (с понедельника по воскресенье) или текущий месяц. */
export function presetRange(preset: Preset, now: Date): DateRange {
  const today = startOfDay(now);
  switch (preset) {
    case 'today':
      return { fromDate: toDateInput(today), toDate: toDateInput(today) };
    case 'week': {
      const monday = addDays(today, -((today.getDay() + 6) % 7));
      return { fromDate: toDateInput(monday), toDate: toDateInput(addDays(monday, 6)) };
    }
    case 'month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { fromDate: toDateInput(first), toDate: toDateInput(last) };
    }
  }
}

/** Даты выбранного периода. Пресет считается от сегодняшнего дня, свои даты остаются как есть. */
export function resolveSelection(selection: PeriodSelection, today: Date): DateRange {
  return 'preset' in selection ? presetRange(selection.preset, today) : selection.custom;
}

/** Расхождение меньше этого считаем погрешностью измерения, а не разницей часов (см. estimateClockOffset). */
export const CLOCK_TOLERANCE_MS = 2000;

/**
 * На сколько часы сервера впереди часов браузера. Таймеры начаты по часам сервера, и если в браузере
 * часы спешат на 3 минуты, только что запущенный таймер показал бы 0:03:00.
 * serverMs: время сервера из ответа, clientMs: время браузера, когда ответ пришёл. Сервер округляет
 * время вниз до секунды, ответ идёт по сети, поэтому расхождение меньше CLOCK_TOLERANCE_MS считаем нулём.
 */
export function estimateClockOffset(serverMs: number, clientMs: number): number {
  const offset = serverMs - clientMs;
  return Math.abs(offset) < CLOCK_TOLERANCE_MS ? 0 : offset;
}

/**
 * Досчитывает идущие таймеры отчёта от момента расчёта до now, не выходя за конец периода.
 * Так отчёт «тикает» вместе с таймерами без повторных запросов к серверу.
 */
export function withLiveDurations(report: Report, now: number): Report {
  const end = Math.min(now, Date.parse(report.to));
  const since = Math.max(Date.parse(report.generatedAt), Date.parse(report.from));
  if (end <= since) return report;
  // Обычно запись начата раньше расчёта отчёта. Если часы сервера ушли назад, она могла начаться
  // позже generatedAt; тогда досчитываем от её начала, иначе прибавили бы время до её старта.
  const extra = (startedAt: string) => floorToSecond(Math.max(0, end - Math.max(since, Date.parse(startedAt))));

  const employees = report.employees.map((employee) => {
    if (employee.entries.every((entry) => entry.endedAt !== null)) return employee;
    const entries = employee.entries.map((entry) =>
      entry.endedAt === null ? { ...entry, durationMs: entry.durationMs + extra(entry.startedAt) } : entry,
    );
    return { ...employee, entries, totalMs: entries.reduce((sum, entry) => sum + entry.durationMs, 0) };
  });
  return { ...report, totalMs: employees.reduce((sum, employee) => sum + employee.totalMs, 0), employees };
}
