import { builtinEnvironments, type Environment } from 'vitest/runtime';

// DOM из jsdom, но модули собираются как для Node: тесты интерфейса поднимают настоящий
// сервер, а ему нужен node:sqlite, который сборка для браузера не пропускает.
export default {
  ...builtinEnvironments.jsdom,
  name: 'jsdom-node',
  viteEnvironment: 'ssr',
} satisfies Environment;
