import type { FastifyInstance } from 'fastify';

/**
 * Направляет fetch браузера в app.inject(): интерфейс в тестах работает с настоящим API
 * и базой в памяти, без сети и без подменённых ответов.
 */
export function routeFetchTo(app: FastifyInstance): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await app.inject({
      method: (init?.method ?? 'GET') as 'GET' | 'POST',
      url: String(input),
      headers: init?.headers as Record<string, string> | undefined,
      payload: init?.body as string | undefined,
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: { 'content-type': String(response.headers['content-type'] ?? '') },
    });
  };
  return () => {
    globalThis.fetch = original;
  };
}

/** В jsdom нет matchMedia. narrow: экран уже 860 px, панели становятся вкладками. */
export function stubScreen({ narrow }: { narrow: boolean }): void {
  window.matchMedia = (query: string) =>
    ({
      matches: narrow,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
