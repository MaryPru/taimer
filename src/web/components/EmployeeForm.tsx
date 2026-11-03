import { useEffect, useRef, useState, type FormEvent } from 'react';
import { findNamesake } from '../../shared/names.js';
import { LIMITS } from '../../shared/types.js';
import { api, errorMessage } from '../api';

interface Props {
  /** Уже добавленные сотрудники: по ним форма предупреждает о тёзке. */
  employees: readonly { name: string }[];
  onCreated: () => Promise<void>;
}

export function EmployeeForm({ employees, onCreated }: Props) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const refocus = useRef(false);
  // Тёзки бывают, поэтому не запрещаем, а предупреждаем заранее, пока имя набирают.
  const namesake = findNamesake(name, employees);

  // Поле заблокировано на время запроса и теряет фокус. Возвращаем его, чтобы сразу ввести следующего.
  useEffect(() => {
    if (pending || !refocus.current) return;
    refocus.current = false;
    inputRef.current?.focus();
  }, [pending]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    refocus.current = true;
    try {
      await api.createEmployee(name);
      setName('');
      await onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="employee-form" onSubmit={handleSubmit}>
      <label htmlFor="employee-name">Новый сотрудник</label>
      <div className="row">
        <input
          ref={inputRef}
          id="employee-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Имя и фамилия"
          maxLength={LIMITS.employeeNameMax}
          autoComplete="off"
          disabled={pending}
          aria-describedby={namesake ? 'employee-name-warn' : undefined}
        />
        <button type="submit" className="btn btn-primary" disabled={pending || name.trim() === ''}>
          {namesake ? 'Добавить ещё одного' : 'Добавить'}
        </button>
      </div>
      {/* Область объявлений есть всегда: появившуюся вместе с текстом экранный диктор может не прочитать. */}
      <div role="status">
        {namesake && (
          <p id="employee-name-warn" className="warn">
            «{namesake.name}» уже есть в списке. Если это другой человек, добавьте уточнение, чтобы различать их в
            отчёте.
          </p>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
