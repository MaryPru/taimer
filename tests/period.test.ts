import { describe, expect, it } from 'vitest';
import { AppError } from '../src/server/errors.js';
import { parseInstant, parsePeriod, shareInPeriod, type Period } from '../src/server/period.js';

function errorOf(fn: () => unknown): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('ожидали ошибку');
}

describe('parseInstant', () => {
  it.each([
    ['2026-11-02T00:00:00Z', '2026-11-02T00:00:00.000Z'],
    ['2026-11-02T00:00:00+03:00', '2026-11-01T21:00:00.000Z'],
    ['2026-11-02T00:00-05:30', '2026-11-02T05:30:00.000Z'],
    ['2026-11-02T09:15:30.250Z', '2026-11-02T09:15:30.250Z'],
    ['2028-02-29T00:00:00Z', '2028-02-29T00:00:00.000Z'],
    ['2000-02-29T00:00:00Z', '2000-02-29T00:00:00.000Z'],
    ['2026-12-31T23:59:59Z', '2026-12-31T23:59:59.000Z'],
  ])('принимает %s', (value, expected) => {
    expect(new Date(parseInstant(value, 'from')).toISOString()).toBe(expected);
  });

  it.each([
    ['только дата', '2026-11-02'],
    ['без часового пояса', '2026-11-02T00:00:00'],
    ['не ISO', 'Nov 2 2026'],
    ['24:00', '2026-11-02T24:00:00Z'],
    ['пустая строка', ''],
  ])('отклоняет: %s', (_case, value) => {
    expect(errorOf(() => parseInstant(value, 'from')).message).toMatch(/^from: ожидается дата и время ISO 8601/);
  });

  it.each([
    '2026-02-30T00:00:00Z',
    '2026-02-29T00:00:00Z',
    '2100-02-29T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-00-10T00:00:00Z',
    '2026-11-00T00:00:00Z',
  ])(
    'отклоняет несуществующую дату %s, а не переносит её на следующий месяц',
    (value) => {
      expect(errorOf(() => parseInstant(value, 'to')).message).toMatch(/^to: такой даты нет в календаре/);
    },
  );

  it('подсказывает про %2B, если «+» в часовом поясе превратился в пробел', () => {
    expect(errorOf(() => parseInstant('2026-11-02T00:00:00 03:00', 'from')).message).toMatch(/%2B/);
  });
});

describe('parsePeriod', () => {
  it('возвращает полуинтервал в мс', () => {
    expect(parsePeriod('2026-11-02T00:00:00Z', '2026-11-03T00:00:00Z')).toEqual({
      from: Date.parse('2026-11-02T00:00:00Z'),
      to: Date.parse('2026-11-03T00:00:00Z'),
    });
  });

  it.each([
    ['from равен to', '2026-11-02T00:00:00Z', '2026-11-02T00:00:00Z'],
    ['from позже to', '2026-11-03T00:00:00Z', '2026-11-02T00:00:00Z'],
    ['тот же момент в разных поясах', '2026-11-02T03:00:00+03:00', '2026-11-02T00:00:00Z'],
  ])('отклоняет: %s', (_case, from, to) => {
    expect(errorOf(() => parsePeriod(from, to)).message).toMatch(/должно быть раньше/);
  });
});

describe('shareInPeriod', () => {
  const period: Period = { from: 1000, to: 2000 };

  it.each([
    ['внутри периода', 1200, 1500, 300],
    ['пересекает начало', 500, 1300, 300],
    ['пересекает конец', 1800, 2600, 200],
    ['накрывает период целиком', 0, 5000, 1000],
    ['совпадает с периодом', 1000, 2000, 1000],
    ['нулевая длительность в начале периода', 1000, 1000, 0],
    ['нулевая длительность внутри', 1500, 1500, 0],
  ])('%s', (_case, start, end, expected) => {
    expect(shareInPeriod(start, end, period)).toBe(expected);
  });

  it.each([
    ['заканчивается ровно в начале периода', 500, 1000],
    ['начинается ровно в конце периода', 2000, 2500],
    ['целиком до периода', 100, 900],
    ['целиком после периода', 2100, 2900],
    ['нулевая длительность ровно в конце периода', 2000, 2000],
  ])('не попадает: %s', (_case, start, end) => {
    expect(shareInPeriod(start, end, period)).toBeNull();
  });
});
