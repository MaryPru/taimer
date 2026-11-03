import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  estimateClockOffset,
  formatDuration,
  formatEntrySpan,
  fromDateInput,
  isLongRunning,
  msUntilNextDay,
  presetRange,
  rangeToPeriod,
  resolveSelection,
  toLocalIso,
  withLiveDurations,
} from '../src/shared/time.js';
import type { Report } from '../src/shared/types.js';
import { HOUR, MINUTE } from './helpers.js';

// Функции работают в поясе браузера. Фиксируем пояс с переводом часов, чтобы проверить дни на 23 и 25 часов.
// Каждый файл тестов Vitest идёт в отдельном процессе, поэтому другие тесты это не задевает.
let originalTz: string | undefined;
beforeAll(() => {
  originalTz = process.env.TZ;
  process.env.TZ = 'Europe/Berlin';
});
afterAll(() => {
  process.env.TZ = originalTz;
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00:00'],
    [999, '0:00:00'],
    [59_999, '0:00:59'],
    [MINUTE, '0:01:00'],
    [HOUR + 5 * MINUTE + 9_000, '1:05:09'],
    [26 * HOUR, '26:00:00'],
    [-5_000, '0:00:00'],
  ])('%i мс → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe('formatEntrySpan', () => {
  const now = new Date(2026, 10, 2, 12);

  it('в пределах одного дня конец без даты', () => {
    expect(formatEntrySpan('2026-11-02T07:00:00.000Z', '2026-11-02T08:15:00.000Z', now)).toEqual({
      start: '02.11, 08:00',
      end: '09:15',
    });
  });

  it('через полночь конец с датой', () => {
    expect(formatEntrySpan('2026-11-01T22:00:00.000Z', '2026-11-02T00:30:00.000Z', now)).toEqual({
      start: '01.11, 23:00',
      end: '02.11, 01:30',
    });
  });

  it('полночь считается по местному времени, а не по UTC', () => {
    // По UTC это одни сутки (22:30–23:30 второго ноября), по Берлину запись переходит в третье.
    expect(formatEntrySpan('2026-11-02T22:30:00.000Z', '2026-11-02T23:30:00.000Z', now)).toEqual({
      start: '02.11, 23:30',
      end: '03.11, 00:30',
    });
  });

  it('идущий таймер без конца', () => {
    expect(formatEntrySpan('2026-11-02T13:26:00.000Z', null, now)).toEqual({ start: '02.11, 14:26', end: null });
  });

  it('год пишется у дат не текущего года', () => {
    expect(formatEntrySpan('2025-11-03T07:00:00.000Z', '2025-11-03T08:00:00.000Z', now)).toEqual({
      start: '03.11.2025, 08:00',
      end: '09:00',
    });
  });

  it('запись через Новый год: год только у прошлогодней даты', () => {
    const january = new Date(2027, 0, 1, 12);
    expect(formatEntrySpan('2026-12-31T21:00:00.000Z', '2027-01-01T01:00:00.000Z', january)).toEqual({
      start: '31.12.2026, 22:00',
      end: '01.01, 02:00',
    });
  });
});

describe('isLongRunning', () => {
  const startedAt = '2026-11-02T08:00:00.000Z';

  it('до 12 часов таймер обычный', () => {
    expect(isLongRunning(startedAt, Date.parse(startedAt) + 12 * HOUR - 1_000)).toBe(false);
  });

  it('с 12 часов таймер, скорее всего, забыли остановить', () => {
    expect(isLongRunning(startedAt, Date.parse(startedAt) + 12 * HOUR)).toBe(true);
    expect(isLongRunning(startedAt, Date.parse(startedAt) + 3 * 24 * HOUR)).toBe(true);
  });
});

describe('msUntilNextDay', () => {
  it('считает до местной полуночи', () => {
    expect(msUntilNextDay(new Date(2026, 10, 2, 23, 59, 30))).toBe(30_000);
    expect(msUntilNextDay(new Date(2026, 10, 2, 0, 0, 0))).toBe(24 * HOUR);
  });

  it('в ночь перевода на зимнее время до полуночи 25 часов', () => {
    expect(msUntilNextDay(new Date(2026, 9, 25, 0, 0, 0))).toBe(25 * HOUR);
  });
});

describe('resolveSelection', () => {
  it('пресет после полуночи переходит на новый день', () => {
    const selection = { preset: 'today' } as const;
    expect(resolveSelection(selection, new Date(2026, 10, 2))).toEqual({ fromDate: '2026-11-02', toDate: '2026-11-02' });
    expect(resolveSelection(selection, new Date(2026, 10, 3))).toEqual({ fromDate: '2026-11-03', toDate: '2026-11-03' });
  });

  it('свои даты не меняются от сегодняшнего дня', () => {
    const custom = { fromDate: '2026-11-02', toDate: '2026-11-02' };
    expect(resolveSelection({ custom }, new Date(2026, 10, 3))).toBe(custom);
  });
});

describe('toLocalIso', () => {
  it('пишет локальное время с зимним и летним смещением', () => {
    expect(toLocalIso(new Date(2026, 0, 15, 9, 30))).toBe('2026-01-15T09:30:00+01:00');
    expect(toLocalIso(new Date(2026, 6, 15, 9, 30))).toBe('2026-07-15T09:30:00+02:00');
  });
});

describe('fromDateInput', () => {
  it('разбирает дату как локальную полночь', () => {
    expect(toLocalIso(fromDateInput('2026-11-02')!)).toBe('2026-11-02T00:00:00+01:00');
  });

  it('не превращает год 0026 в 1926', () => {
    expect(fromDateInput('0026-01-01')!.getFullYear()).toBe(26);
  });

  it.each(['', '2026-02-30', '2026-13-01', '02.11.2026', '2026-1-5'])('отклоняет «%s»', (value) => {
    expect(fromDateInput(value)).toBeNull();
  });
});

describe('rangeToPeriod', () => {
  it('один день: от полуночи до полуночи следующего дня', () => {
    expect(rangeToPeriod({ fromDate: '2026-11-02', toDate: '2026-11-02' })).toEqual({
      from: '2026-11-02T00:00:00+01:00',
      to: '2026-11-03T00:00:00+01:00',
    });
  });

  it('день перехода на летнее время длится 23 часа, граница не съезжает на 01:00', () => {
    const period = rangeToPeriod({ fromDate: '2026-03-29', toDate: '2026-03-29' })!;
    expect(period).toEqual({ from: '2026-03-29T00:00:00+01:00', to: '2026-03-30T00:00:00+02:00' });
    expect(Date.parse(period.to) - Date.parse(period.from)).toBe(23 * HOUR);
  });

  it('день перехода на зимнее время длится 25 часов', () => {
    const period = rangeToPeriod({ fromDate: '2026-10-25', toDate: '2026-10-25' })!;
    expect(period).toEqual({ from: '2026-10-25T00:00:00+02:00', to: '2026-10-26T00:00:00+01:00' });
    expect(Date.parse(period.to) - Date.parse(period.from)).toBe(25 * HOUR);
  });

  it.each([
    ['начало позже конца', '2026-11-03', '2026-11-02'],
    ['пустое начало', '', '2026-11-02'],
    ['пустой конец', '2026-11-02', ''],
  ])('null: %s', (_case, fromDate, toDate) => {
    expect(rangeToPeriod({ fromDate, toDate })).toBeNull();
  });
});

describe('presetRange', () => {
  it('сегодня', () => {
    expect(presetRange('today', new Date(2026, 10, 4, 23, 59))).toEqual({ fromDate: '2026-11-04', toDate: '2026-11-04' });
  });

  it.each([
    ['понедельник', new Date(2026, 10, 2, 8)],
    ['среда', new Date(2026, 10, 4, 12)],
    ['воскресенье поздно вечером', new Date(2026, 10, 8, 23, 30)],
  ])('неделя с понедельника по воскресенье, если сегодня %s', (_case, now) => {
    expect(presetRange('week', now)).toEqual({ fromDate: '2026-11-02', toDate: '2026-11-08' });
  });

  it('неделя на стыке месяцев и лет', () => {
    expect(presetRange('week', new Date(2026, 11, 31))).toEqual({ fromDate: '2026-12-28', toDate: '2027-01-03' });
  });

  it('месяц, включая 29 февраля високосного года', () => {
    expect(presetRange('month', new Date(2026, 10, 15))).toEqual({ fromDate: '2026-11-01', toDate: '2026-11-30' });
    expect(presetRange('month', new Date(2028, 1, 10))).toEqual({ fromDate: '2028-02-01', toDate: '2028-02-29' });
  });
});

describe('estimateClockOffset', () => {
  const server = Date.parse('2026-11-02T12:00:00.000Z');

  it('часы браузера спешат или отстают: поправка на разницу', () => {
    expect(estimateClockOffset(server, server + 3 * MINUTE)).toBe(-3 * MINUTE);
    expect(estimateClockOffset(server, server - 30_000)).toBe(30_000);
  });

  it('округление до секунды и задержка сети не считаются разницей часов', () => {
    expect(estimateClockOffset(server, server + 1_900)).toBe(0);
    expect(estimateClockOffset(server, server - 1_900)).toBe(0);
  });
});

describe('withLiveDurations', () => {
  const report: Report = {
    from: '2026-11-02T00:00:00.000Z',
    to: '2026-11-03T00:00:00.000Z',
    generatedAt: '2026-11-02T12:00:00.000Z',
    totalMs: 3 * HOUR,
    employees: [
      {
        id: 1,
        name: 'Анна Тестова',
        totalMs: 3 * HOUR,
        entries: [
          { id: 1, employeeId: 1, task: 'Готово', startedAt: '2026-11-02T08:00:00.000Z', endedAt: '2026-11-02T09:00:00.000Z', durationMs: HOUR },
          { id: 2, employeeId: 1, task: 'Идёт', startedAt: '2026-11-02T10:00:00.000Z', endedAt: null, durationMs: 2 * HOUR },
        ],
      },
      { id: 2, name: 'Борис Пробный', totalMs: 0, entries: [] },
    ],
  };

  it('прибавляет прошедшее время только к идущим записям и итогам', () => {
    const live = withLiveDurations(report, Date.parse('2026-11-02T12:10:00.000Z'));

    expect(live.employees[0]!.entries.map((e) => e.durationMs)).toEqual([HOUR, 2 * HOUR + 10 * MINUTE]);
    expect(live.employees[0]!.totalMs).toBe(3 * HOUR + 10 * MINUTE);
    expect(live.employees[1]!.totalMs).toBe(0);
    expect(live.totalMs).toBe(3 * HOUR + 10 * MINUTE);
  });

  it('не выходит за конец периода', () => {
    const live = withLiveDurations(report, Date.parse('2026-11-03T05:00:00.000Z'));
    expect(live.employees[0]!.entries[1]!.durationMs).toBe(14 * HOUR);
  });

  it('не меняет отчёт, если время не ушло вперёд', () => {
    expect(withLiveDurations(report, Date.parse('2026-11-02T11:00:00.000Z'))).toBe(report);
  });

  it('запись, начатую позже расчёта отчёта (часы сервера ушли назад), досчитывает от её начала', () => {
    // Сервер отдал запись с нулём: на его часах она ещё не началась.
    const backwards: Report = {
      ...report,
      totalMs: HOUR,
      employees: [
        {
          id: 1,
          name: 'Анна Тестова',
          totalMs: HOUR,
          entries: [
            report.employees[0]!.entries[0]!,
            { id: 2, employeeId: 1, task: 'Идёт', startedAt: '2026-11-02T12:10:00.000Z', endedAt: null, durationMs: 0 },
          ],
        },
      ],
    };

    const live = withLiveDurations(backwards, Date.parse('2026-11-02T12:15:00.000Z'));

    expect(live.employees[0]!.entries[1]!.durationMs).toBe(5 * MINUTE);
    expect(live.totalMs).toBe(HOUR + 5 * MINUTE);
  });

  it('прибавляет целые секунды, чтобы итог совпадал с суммой строк', () => {
    const twoRunning: Report = {
      ...report,
      employees: [
        report.employees[0]!,
        {
          id: 2,
          name: 'Борис Пробный',
          totalMs: HOUR,
          entries: [{ id: 3, employeeId: 2, task: 'Тоже идёт', startedAt: '2026-11-02T11:00:00.000Z', endedAt: null, durationMs: HOUR }],
        },
      ],
      totalMs: 4 * HOUR,
    };

    // 1,6 с после расчёта: по 1 с каждой из двух идущих записей, а не 1,6 + 1,6 = 3,2 с в итоге.
    const live = withLiveDurations(twoRunning, Date.parse('2026-11-02T12:00:01.600Z'));

    const rows = live.employees.flatMap((employee) => employee.entries.map((entry) => entry.durationMs));
    expect(rows).toEqual([HOUR, 2 * HOUR + 1_000, HOUR + 1_000]);
    expect(live.totalMs).toBe(rows.reduce((sum, ms) => sum + ms, 0));
  });
});
