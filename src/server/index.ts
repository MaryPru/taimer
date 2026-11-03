import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp } from './app.js';
import { dbPath, projectRoot } from './config.js';
import { openDb } from './db.js';

const webDir = join(projectRoot, 'dist', 'web');
const port = Number(process.env.PORT ?? 3000);

const db = openDb(dbPath);
const app = await buildApp({
  db,
  webDir: existsSync(webDir) ? webDir : undefined,
  logger: { level: 'warn' },
});

async function shutdown(): Promise<void> {
  await app.close();
  db.close();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ port, host: 'localhost' });
console.log(`Taimer: http://localhost:${port}  (база: ${dbPath})`);
