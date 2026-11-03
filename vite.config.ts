import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = process.env.PORT ?? '3000';

export default defineConfig({
  root: fileURLToPath(new URL('./src/web', import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('./dist/web', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // В разработке клиент живёт на Vite, а запросы к API уходят на Fastify.
    proxy: { '/api': `http://localhost:${API_PORT}` },
  },
});
