import { useEffect, useMemo, useState, type HTMLAttributes } from 'react';
import {
  formatDuration,
  formatEntrySpan,
  isLongRunning,
  LONG_RUNNING_HOURS,
  rangeToPeriod,
  resolveSelection,
  withLiveDurations,
  type PeriodSelection,
} from '../../shared/time.js';
import type { Report } from '../../shared/types.js';
import { api, errorMessage, isNetworkError } from '../api';
import { useToday } from '../hooks/useToday';
import { PeriodPicker } from './PeriodPicker';

interface Props {
  /** Меняется после каждого изменения данных: отчёт перечитывается. */
  version: number;
  now: number;
  /** Над страницей уже висит баннер «сервер не отвечает», свой такой же текст не нужен. */
  serverDown: boolean;
  /** Атрибуты панели, когда она показана вкладкой. */
  panelProps?: HTMLAttributes<HTMLElement>;
}

export function ReportView({ version, now, serverDown, panelProps }: Props) {
  const today = useToday();
  const [selection, setSelection] = useState<PeriodSelection>({ preset: 'today' });
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  // В полночь меняется today, вместе с ним даты пресета, и отчёт перечитывается за новый день.
  const range = useMemo(() => resolveSelection(selection, today), [selection, today]);
  const period = useMemo(() => rangeToPeriod(range), [range]);
  const from = period?.from;
  const to = period?.to;

  useEffect(() => {
    // Период стал неверным, пока шёл запрос: ответ на него отброшен, и «обновляем…» снимаем здесь.
    if (!from || !to) {
      setLoading(false);
      return;
    }
    // Ответ на устаревший запрос (период успели сменить) не должен затереть свежий.
    let ignore = false;
    setLoading(true);
    api
      .getReport(from, to)
      .then((data) => {
        if (ignore) return;
        setReport(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!ignore) setError(err);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [from, to, version]);

  // Отчёт за прежний период не выдаём за текущий. Пока новый грузится, прежний приглушён,
  // а если загрузка не удалась, скрыт: иначе цифры за сегодня стояли бы под датами месяца.
  const isCurrent =
    report !== null && !!from && !!to && Date.parse(report.from) === Date.parse(from) && Date.parse(report.to) === Date.parse(to);
  const shown = report && (isCurrent || loading) ? withLiveDurations(report, now) : null;
  const withEntries = shown?.employees.filter((employee) => employee.entries.length > 0) ?? [];

  return (
    <section className="panel" aria-labelledby="report-title" {...panelProps}>
      <div className="panel-head">
        <h2 id="report-title">Отчёт</h2>
        {loading && <span className="muted">обновляем…</span>}
      </div>

      <PeriodPicker selection={selection} range={range} onChange={setSelection} />

      {!period && <p className="hint">Укажите обе даты. Дата «с» не может быть позже даты «по».</p>}
      {error !== null && !(serverDown && isNetworkError(error)) && (
        <p className="error" role="alert">
          {errorMessage(error)}
        </p>
      )}

      {period && shown && (
        <div className={isCurrent ? 'report-body' : 'report-body is-stale'} aria-busy={!isCurrent}>
          <p className="report-total">
            Итого за период <b className="mono">{formatDuration(shown.totalMs)}</b>
          </p>

          {shown.employees.length === 0 ? (
            <p className="empty">Сотрудников пока нет. Добавьте сотрудника и запустите таймер, чтобы здесь появились записи.</p>
          ) : withEntries.length === 0 ? (
            <p className="empty">За выбранный период записей нет. Запустите таймер или выберите другой период.</p>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Сотрудник</th>
                      <th className="num col-count">Записей</th>
                      <th className="num col-time">Время</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.employees.map((employee) => (
                      <tr key={employee.id}>
                        <td>{employee.name}</td>
                        <td className="num">{employee.entries.length}</td>
                        <td className="num mono">{formatDuration(employee.totalMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {withEntries.map((employee) => (
                <div key={employee.id} className="entries">
                  <h3>
                    {employee.name} <span className="mono muted">{formatDuration(employee.totalMs)}</span>
                  </h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Задача</th>
                          <th className="num col-time">В периоде</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employee.entries.map((entry) => {
                          const span = formatEntrySpan(entry.startedAt, entry.endedAt, today);
                          return (
                            <tr key={entry.id}>
                              <td>
                                {entry.task}
                                <span className="when">
                                  <span className="mono">{span.start}</span> –{' '}
                                  {span.end ? (
                                    <span className="mono">{span.end}</span>
                                  ) : isLongRunning(entry.startedAt, now) ? (
                                    <span className="badge badge-warn">идёт больше {LONG_RUNNING_HOURS} ч</span>
                                  ) : (
                                    <span className="badge">идёт</span>
                                  )}
                                </span>
                              </td>
                              <td className="num mono">{formatDuration(entry.durationMs)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
