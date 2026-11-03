import { estimateClockOffset } from '../shared/time.js';

// Время на экране считается по часам сервера: он ставит startedAt у таймеров и generatedAt у отчёта.
// Поправку обновляет api.ts по каждому ответу, в котором есть «сейчас» сервера.
let offset = 0;

export function observeServerTime(serverIso: string, receivedAt = Date.now()): void {
  offset = estimateClockOffset(Date.parse(serverIso), receivedAt);
}

export function serverNow(): number {
  return Date.now() + offset;
}
