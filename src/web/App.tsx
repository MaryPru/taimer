import { useCallback, useEffect, useRef, useState } from 'react';
import type { EmployeeWithTimer } from '../shared/types.js';
import { api, errorMessage } from './api';
import { EmployeeForm } from './components/EmployeeForm';
import { EmployeeRow } from './components/EmployeeRow';
import { ReportView } from './components/ReportView';
import { panelId, Tabs } from './components/Tabs';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useNow } from './hooks/useNow';

// Та же ширина, на которой в styles.css панели встают в одну колонку.
const NARROW_SCREEN = '(max-width: 860px)';

type TabName = 'employees' | 'report';

export function App() {
  const [employees, setEmployees] = useState<EmployeeWithTimer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Счётчик изменений данных: по нему отчёт понимает, что пора перечитаться.
  const [version, setVersion] = useState(0);
  const narrow = useMediaQuery(NARROW_SCREEN);
  const [tab, setTab] = useState<TabName>('employees');

  // Строки сотрудников перечитывают список независимо друг от друга. Запросы идут по очереди:
  // иначе ответ на ранний запрос мог прийти последним и затереть свежий список,
  // и у только что запущенного таймера снова появилась бы форма «Старт».
  const reloadQueue = useRef(Promise.resolve());
  const reload = useCallback(() => {
    const next = reloadQueue.current.then(async () => {
      try {
        setEmployees(await api.listEmployees());
        setLoadError(null);
      } catch (err) {
        setLoadError(errorMessage(err));
      }
      setVersion((value) => value + 1);
    });
    reloadQueue.current = next;
    return next;
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const running = employees?.filter((employee) => employee.activeEntry !== null).length ?? 0;
  const now = useNow(running > 0);

  // На узком экране панели друг под другом, и до отчёта пришлось бы листать весь список сотрудников.
  // Поэтому там они становятся вкладками, а на широком стоят рядом.
  const panel = (name: TabName) => (narrow ? { role: 'tabpanel', id: panelId(name), hidden: tab !== name } : {});

  return (
    <div className="app">
      <header className="app-head">
        <h1>Taimer</h1>
        <p className="muted">Учёт рабочего времени сотрудников</p>
      </header>

      {loadError && (
        <div className="banner" role="alert">
          <span>{loadError}</span>
          <button type="button" className="btn" onClick={() => void reload()}>
            Повторить
          </button>
        </div>
      )}

      {narrow && (
        <Tabs
          label="Разделы"
          selected={tab}
          onSelect={setTab}
          tabs={[
            {
              id: 'employees',
              label: (
                <>
                  Сотрудники
                  {running > 0 && (
                    <span className="tab-badge">
                      {running}
                      <span className="visually-hidden"> с таймером</span>
                    </span>
                  )}
                </>
              ),
            },
            { id: 'report', label: 'Отчёт' },
          ]}
        />
      )}

      <main className="layout">
        <section className="panel" aria-labelledby="employees-title" {...panel('employees')}>
          <div className="panel-head">
            <h2 id="employees-title">Сотрудники</h2>
          </div>
          <EmployeeForm employees={employees ?? []} onCreated={reload} />
          {employees === null ? (
            !loadError && <p className="muted">Загрузка…</p>
          ) : employees.length === 0 ? (
            <p className="empty">Сотрудников пока нет. Добавьте первого, например «Анна Тестова».</p>
          ) : (
            <ul className="employees">
              {employees.map((employee) => (
                <EmployeeRow key={employee.id} employee={employee} now={now} onChanged={reload} />
              ))}
            </ul>
          )}
        </section>

        <ReportView version={version} now={now} serverDown={loadError !== null} panelProps={panel('report')} />
      </main>
    </div>
  );
}
