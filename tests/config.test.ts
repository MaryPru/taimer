import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectRoot, resolveDbPath } from '../src/server/config.js';

describe('путь к файлу базы', () => {
  const fallback = join(projectRoot, 'data', 'taimer.db');

  it('без DB_PATH: data/taimer.db в корне проекта', () => {
    expect(resolveDbPath(undefined)).toBe(fallback);
  });

  it.each(['', '   '])('пустой DB_PATH «%s» считается незаданным, а не временной базой', (value) => {
    expect(resolveDbPath(value)).toBe(fallback);
  });

  it('относительный путь от текущей папки становится абсолютным', () => {
    expect(resolveDbPath('tmp/demo.db')).toBe(resolve('tmp/demo.db'));
  });
});
