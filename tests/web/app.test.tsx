import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app.js';
import { IN_MEMORY, openDb, type Db } from '../../src/server/db.js';
import { App } from '../../src/web/App';
import { addEmployee, countEntries, start } from '../helpers.js';
import { routeFetchTo, stubScreen } from './harness.js';

// Сценарии задания на уровне интерфейса. Сервер настоящий, с базой в памяти.
describe('интерфейс', () => {
  let db: Db;
  let app: FastifyInstance;
  let restoreFetch: () => void;

  beforeEach(async () => {
    db = openDb(IN_MEMORY);
    app = await buildApp({ db });
    restoreFetch = routeFetchTo(app);
    stubScreen({ narrow: false });
  });

  afterEach(async () => {
    cleanup();
    restoreFetch();
    await app.close();
    db.close();
  });

  const findRow = async (name: string) =>
    (await screen.findByText(name, { selector: '.employee-name' })).closest('li')!;
  const report = () => screen.getByRole('region', { name: 'Отчёт' });

  // Цикл проходится с клавиатуры: после старта фокус на «Стоп», после остановки в поле задачи.
  it('полный цикл: добавить сотрудника, запустить и остановить таймер, увидеть запись в отчёте', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/Сотрудников пока нет. Добавьте первого/);

    // Фокус в поле имени после добавления здесь не проверить: jsdom, в отличие от браузера,
    // не снимает фокус с поля, заблокированного на время запроса.
    await user.type(screen.getByLabelText('Новый сотрудник'), 'Анна Тестова{Enter}');
    const row = await findRow('Анна Тестова');

    // Пока таймер идёт, поля задачи нет: после остановки оно монтируется заново.
    const taskInput = () => within(row).getByLabelText('Задача для сотрудника Анна Тестова');
    await user.type(taskInput(), 'Код-ревью{Enter}');
    const stop = await within(row).findByRole('button', { name: 'Стоп' });
    await waitFor(() => expect(document.activeElement).toBe(stop));
    expect(within(row).getByText('Код-ревью')).toBeTruthy();

    await user.keyboard('{Enter}');
    await within(row).findByRole('button', { name: 'Старт' });
    await waitFor(() => expect(document.activeElement).toBe(taskInput()));

    const entry = await within(report()).findByText('Код-ревью');
    expect(entry.closest('td')!.textContent).not.toContain('идёт');
    expect(countEntries(db)).toBe(1);
  });

  it('повторный старт: таймер уже запустили в другой вкладке, строка показывает ошибку и идущий таймер', async () => {
    const anna = await addEmployee(app, 'Анна Тестова');
    const user = userEvent.setup();
    render(<App />);
    const row = await findRow('Анна Тестова');

    // Другая вкладка запускает таймер, эта о нём ещё не знает и показывает форму «Старт».
    await start(app, anna.id, 'Задача из другой вкладки');
    await user.type(within(row).getByLabelText('Задача для сотрудника Анна Тестова'), 'Код-ревью');
    await user.click(within(row).getByRole('button', { name: 'Старт' }));

    expect((await within(row).findByRole('alert')).textContent).toMatch(/Таймер уже запущен/);
    expect(within(row).getByText('Задача из другой вкладки')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Стоп' })).toBeTruthy();
    expect(countEntries(db)).toBe(1);
  });

  it('пустой отчёт, когда сотрудников нет', async () => {
    render(<App />);
    expect(await within(report()).findByText(/Добавьте сотрудника и запустите таймер/)).toBeTruthy();
  });

  it('пустой отчёт, когда сотрудники есть, а записей за период нет', async () => {
    await addEmployee(app, 'Анна Тестова');
    render(<App />);

    expect(await within(report()).findByText(/За выбранный период записей нет/)).toBeTruthy();
    expect(within(report()).getByText('0:00:00')).toBeTruthy();
  });

  it('предупреждает о тёзке без учёта регистра и лишних пробелов', async () => {
    await addEmployee(app, 'Анна Тестова');
    const user = userEvent.setup();
    render(<App />);
    await findRow('Анна Тестова');

    await user.type(screen.getByLabelText('Новый сотрудник'), '  анна   тестова');

    expect(screen.getByRole('status').textContent).toContain('«Анна Тестова» уже есть в списке');
    expect(screen.getByRole('button', { name: 'Добавить ещё одного' })).toBeTruthy();
  });

  it('на узком экране панели становятся вкладками, стрелка переключает вкладку и фокус', async () => {
    stubScreen({ narrow: true });
    const user = userEvent.setup();
    render(<App />);

    const tabs = await screen.findByRole('tablist', { name: 'Разделы' });
    const employeesTab = within(tabs).getByRole('tab', { name: /Сотрудники/ });
    const reportTab = within(tabs).getByRole('tab', { name: 'Отчёт' });
    expect(employeesTab.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('panel-report')!.hidden).toBe(true);

    employeesTab.focus();
    await user.keyboard('{ArrowRight}');

    expect(reportTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(reportTab);
    expect(document.getElementById('panel-report')!.hidden).toBe(false);
    expect(document.getElementById('panel-employees')!.hidden).toBe(true);
  });
});
