import type { DateRange, PeriodSelection, Preset } from '../../shared/time.js';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: 'Эта неделя' },
  { id: 'month', label: 'Этот месяц' },
];

interface Props {
  selection: PeriodSelection;
  /** Даты выбранного периода: у пресета посчитаны от сегодняшнего дня. */
  range: DateRange;
  onChange: (selection: PeriodSelection) => void;
}

export function PeriodPicker({ selection, range, onChange }: Props) {
  // Ручная правка дат превращает пресет в свой период: он уже не сдвигается вместе с сегодняшним днём.
  const setDates = (custom: DateRange) => onChange({ custom });

  return (
    <div className="period">
      <div className="presets" role="group" aria-label="Быстрый выбор периода">
        {PRESETS.map((preset) => {
          const selected = 'preset' in selection && selection.preset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className={selected ? 'chip is-selected' : 'chip'}
              aria-pressed={selected}
              onClick={() => onChange({ preset: preset.id })}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="dates">
        <label htmlFor="period-from">с</label>
        <input
          id="period-from"
          type="date"
          value={range.fromDate}
          max={range.toDate || undefined}
          onChange={(event) => setDates({ ...range, fromDate: event.target.value })}
        />
        <label htmlFor="period-to">по</label>
        <input
          id="period-to"
          type="date"
          value={range.toDate}
          min={range.fromDate || undefined}
          onChange={(event) => setDates({ ...range, toDate: event.target.value })}
        />
      </div>
    </div>
  );
}
