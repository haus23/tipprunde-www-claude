/**
 * Cloudflare Worker entry point.
 *
 * Static files (hashed assets, service worker, favicon) are served by Workers
 * Static Assets before this handler runs; everything else is rendered here.
 */
import { createApi, DEFAULT_API_BASE } from './api/client.ts';
import { cacheApiStore } from './api/swr.ts';
import { handleRequest } from './app.ts';

interface Env {
  /** Base URL of the Unterbau API, e.g. `https://unterbau.runde.tips/api/v1`. */
  API_BASE?: string;
}

export default {
  async fetch(request, env, ctx) {
    const origin = new URL(request.url).origin;
    const api = createApi({
      base: env.API_BASE || DEFAULT_API_BASE,
      fetch: (input, init) => fetch(input, init),
      now: Date.now,
      waitUntil: (promise) => ctx.waitUntil(promise),
      persistent: cacheApiStore(caches.default, origin),
    });
    try {
      return await handleRequest(request, api);
    } catch (error) {
      console.error('[worker] unhandled', error);
      return new Response('Interner Fehler', {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
  },
} satisfies ExportedHandler<Env>;
