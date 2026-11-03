import { useEffect, useState } from 'react';
import { msUntilNextDay, startOfDay } from '../../shared/time.js';

/**
 * Местная полночь текущего дня. Меняется, когда наступают новые сутки, даже если страница открыта
 * с вечера. Таймер до полуночи в спящей вкладке или на уснувшем ноутбуке может опоздать,
 * поэтому день перепроверяется и при возвращении на страницу.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(timer);
      const now = new Date();
      const day = startOfDay(now);
      // Тот же день оставляет прежний объект: зависящие от него расчёты не перезапускаются.
      setToday((prev) => (prev.getTime() === day.getTime() ? prev : day));
      // Сработает чуть раньше полуночи, значит, проверка повторится через оставшиеся миллисекунды.
      timer = setTimeout(check, msUntilNextDay(now));
    };
    check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  return today;
}
