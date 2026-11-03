import { useEffect, useState } from 'react';
import { serverNow } from '../serverClock';

/**
 * Текущее время по часам сервера, обновляемое раз в секунду, пока active. Один таймер на всё
 * приложение, чтобы счётчики сотрудников и отчёт тикали синхронно.
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    if (!active) return;
    setNow(serverNow());
    const id = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);

  return now;
}
