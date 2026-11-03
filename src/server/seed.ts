// npm run seed: заполняет базу вымышленными сотрудниками и записями, чтобы сразу посмотреть отчёт.
import { dbPath } from './config.js';
import { openDb } from './db.js';
import { seedDemoData } from './demo-data.js';

const db = openDb(dbPath);
try {
  const { employees, entries, running } = seedDemoData(db, Date.now());
  console.log(`Добавлено сотрудников: ${employees}, записей: ${entries}, из них идущих: ${running}. База: ${dbPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  db.close();
}
