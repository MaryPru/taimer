import { AppError } from './errors.js';

/** Полуинтервал [from, to) в мс UTC. */
export interface Period {
  from: number;
  to: number;
}

// Только полная дата и время с явным часовым поясом. Date.parse принимает больше, но с ловушками:
// «2026-11-02» читается как полночь UTC, «2026-11-02T00:00:00» как полночь в поясе сервера.
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;

const EXAMPLE = '2026-11-02T00:00:00+03:00';

export function parsePeriod(fromRaw: string, toRaw: string): Period {
  const from = parseInstant(fromRaw, 'from');
  const to = parseInstant(toRaw, 'to');
  if (from >= to) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Начало периода (from) должно быть раньше конца (to)');
  }
  return { from, to };
}

export function parseInstant(value: string, field: string): number {
  const match = ISO_INSTANT.exec(value);
  if (!match) {
    // В query-строке «+» означает пробел, поэтому незакодированное «+03:00» приходит как « 03:00».
    if (ISO_INSTANT.test(value.replace(/ (\d{2}:\d{2})$/, '+$1'))) {
      throw invalid(field, 'знак «+» в часовом поясе нужно передавать как %2B (encodeURIComponent)');
    }
    throw invalid(field, `ожидается дата и время ISO 8601 с часовым поясом, например ${EXAMPLE}`);
  }

  // Date.parse молча переносит несуществующие даты: 2026-02-30 становится 2 марта.
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw invalid(field, `такой даты нет в календаре: ${value.slice(0, 10)}`);
  }

  return Date.parse(value);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * Сколько мс записи [start, end) приходится на период, или null, если запись в период не попадает.
 * Запись нулевой длительности относится к периоду, в котором началась.
 */
export function shareInPeriod(start: number, end: number, period: Period): number | null {
  const overlaps = start < period.to && end > period.from;
  const pointInside = start === end && start >= period.from && start < period.to;
  if (!overlaps && !pointInside) return null;
  return Math.min(end, period.to) - Math.max(start, period.from);
}

function invalid(field: string, reason: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', `${field}: ${reason}`);
}
