import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // node:sqlite в Node 22 печатает ExperimentalWarning при каждом запуске воркера.
    execArgv: ['--disable-warning=ExperimentalWarning'],
    projects: [
      {
        extends: true,
        test: { name: 'api', include: ['tests/**/*.test.ts'], environment: 'node' },
      },
      {
        // Интерфейс в jsdom поверх настоящего сервера с базой в памяти.
        extends: true,
        plugins: [react()],
        test: { name: 'web', include: ['tests/web/**/*.test.tsx'], environment: './tests/web/jsdom-node.ts' },
      },
    ],
  },
});
