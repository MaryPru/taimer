import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatDuration, isLongRunning, LONG_RUNNING_HOURS } from '../../shared/time.js';
import { LIMITS, type EmployeeWithTimer } from '../../shared/types.js';
import { api, errorMessage, isNetworkError } from '../api';

interface Props {
  employee: EmployeeWithTimer;
  now: number;
  onChanged: () => Promise<void>;
}

interface RowError {
  message: string;
  /** Идущая запись, при которой ошибка верна. undefined, пока запрос и перечитывание списка не закончились. */
  entryId?: number | null;
}

export function EmployeeRow({ employee, now, onChanged }: Props) {
  const [task, setTask] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<RowError | null>(null);
  const active = employee.activeEntry;
  const activeId = active?.id ?? null;
  const longRunning = active !== null && isLongRunning(active.startedAt, now);
  const inputId = `task-${employee.id}`;
  const taskRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);

  // На время запроса поле и кнопка заблокированы и теряют фокус. Когда запрос закончился,
  // возвращаем фокус: после старта на «Стоп», после остановки в поле задачи.
  useEffect(() => {
    if (pending || !refocus.current) return;
    refocus.current = false;
    (activeId !== null ? stopRef.current : taskRef.current)?.focus();
  }, [pending, activeId]);

  // Ошибка верна для состояния, в котором её получили. Когда запрос закончился и список перечитан,
  // привязываем её к текущей записи. Если потом таймер запустят или остановят в другой вкладке,
  // запись сменится и устаревшее сообщение пропадёт. Привязка не зависит от порядка отрисовок:
  // React может применить новый список и pending = false за один раз.
  useEffect(() => {
    if (!pending && error && error.entryId === undefined) setError({ ...error, entryId: activeId });
  }, [pending, error, activeId]);
  const errorText = error && (error.entryId === undefined || error.entryId === activeId) ? error.message : null;

  // Кнопка блокируется на время запроса. После любого ответа, в том числе ошибки, список перечитывается:
  // таймер могли запустить или остановить в другой вкладке.
  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    refocus.current = true;
    try {
      await action();
    } catch (err) {
      // Недоступный сервер покажет общий баннер: перечитывание списка ниже тоже упадёт.
      if (!isNetworkError(err)) setError({ message: errorMessage(err) });
    } finally {
      await onChanged();
      setPending(false);
    }
  }

  function handleStart(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api.startTimer(employee.id, task);
      setTask('');
    });
  }

  function handleStop() {
    void run(async () => {
      await api.stopTimer(employee.id);
    });
  }

  return (
    <li className={`employee${active ? ' is-running' : ''}${longRunning ? ' is-long' : ''}`}>
      <span className="employee-name">{employee.name}</span>
      {active ? (
        <div className="timer">
          <span className="timer-task" title={active.task}>
            {active.task}
          </span>
          <span className="timer-clock" aria-label="Прошло времени">
            {formatDuration(now - Date.parse(active.startedAt))}
          </span>
          <button ref={stopRef} type="button" className="btn btn-stop" onClick={handleStop} disabled={pending}>
            Стоп
          </button>
        </div>
      ) : (
        <form className="timer" onSubmit={handleStart}>
          <label htmlFor={inputId} className="visually-hidden">
            Задача для сотрудника {employee.name}
          </label>
          <input
            ref={taskRef}
            id={inputId}
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="Над чем работает?"
            maxLength={LIMITS.taskMax}
            autoComplete="off"
            disabled={pending}
          />
          <button type="submit" className="btn btn-start" disabled={pending || task.trim() === ''}>
            Старт
          </button>
        </form>
      )}
      {longRunning && (
        <p className="warn">
          Таймер идёт больше {LONG_RUNNING_HOURS} часов. Возможно, его забыли остановить.
        </p>
      )}
      {errorText && (
        <p className="error" role="alert">
          {errorText}
        </p>
      )}
    </li>
  );
}
