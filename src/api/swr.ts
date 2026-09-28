/**
 * Stale-while-revalidate cache for upstream API responses.
 *
 * Every entry remembers when it was fetched. Given a `CachePolicy`:
 *
 *   age < fresh              → serve from cache, no upstream request
 *   fresh ≤ age < swr        → serve from cache, revalidate in the background
 *   age ≥ swr (or no entry)  → fetch upstream and wait for it
 *   upstream fails           → serve the cached entry if age < error, else fail
 *
 * Two tiers: an in-memory map per Worker isolate (fast, short-lived) and an
 * optional persistent store (the Cloudflare Cache API, per data center).
 */

export interface CachePolicy {
  /** Entries younger than this are served without revalidation. */
  fresh: number;
  /** Entries younger than this are served while revalidating in the background. */
  swr: number;
  /** Entries younger than this are served if the upstream request fails. */
  error: number;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Data that can still change: running championships and the championship list. */
export const LIVE_POLICY: CachePolicy = { fresh: 30 * SECOND, swr: 10 * MINUTE, error: 7 * DAY };
/** Completed championships change only through rare corrections. */
export const ARCHIVE_POLICY: CachePolicy = { fresh: HOUR, swr: 30 * DAY, error: 365 * DAY };

export interface CacheEntry {
  /** Raw JSON body as delivered by the upstream API. */
  body: string;
  fetchedAt: number;
  etag?: string;
}

export interface PersistentStore {
  get(key: string): Promise<CacheEntry | undefined>;
  put(key: string, entry: CacheEntry, ttlMs: number): Promise<void>;
}

export interface Loaded<T> {
  data: T;
  fetchedAt: number;
  /** True when the data was served from cache because the upstream failed. */
  fallback: boolean;
}

export interface SwrOptions {
  now: () => number;
  waitUntil: (promise: Promise<unknown>) => void;
  persistent?: PersistentStore;
}

const MEMORY_LIMIT = 500;
const memory = new Map<string, { entry: CacheEntry; parsed?: unknown }>();
const inflight = new Map<string, Promise<CacheEntry>>();

/** For tests. */
export function clearMemoryCache() {
  memory.clear();
  inflight.clear();
}

function remember(key: string, entry: CacheEntry, parsed?: unknown) {
  memory.delete(key);
  memory.set(key, { entry, parsed });
  if (memory.size > MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
}

export type Revalidate = (previous: CacheEntry | undefined) => Promise<CacheEntry>;

/**
 * Resolve `key` according to `policy`. `revalidate` performs the upstream
 * request (it receives the previous entry for conditional requests) and must
 * throw on any failure. `parse` validates the raw body and must throw on
 * invalid data; invalid upstream data therefore never replaces a good entry.
 */
export async function swr<T>(
  key: string,
  policy: CachePolicy,
  revalidate: Revalidate,
  parse: (body: string) => T,
  opts: SwrOptions,
): Promise<Loaded<T>> {
  let cached = memory.get(key);
  if (!cached && opts.persistent) {
    const entry = await opts.persistent.get(key).catch(() => undefined);
    if (entry) {
      cached = { entry };
      remember(key, entry);
    }
  }

  const load = (entry: CacheEntry, fallback: boolean): Loaded<T> => {
    const hit = memory.get(key);
    if (hit && hit.entry === entry && hit.parsed !== undefined) {
      return { data: hit.parsed as T, fetchedAt: entry.fetchedAt, fallback };
    }
    const data = parse(entry.body);
    remember(key, entry, data);
    return { data, fetchedAt: entry.fetchedAt, fallback };
  };

  const refresh = () => {
    let running = inflight.get(key);
    if (!running) {
      running = revalidate(cached?.entry)
        .then((entry) => {
          // Validate before storing: bad data must not evict good data.
          const data = parse(entry.body);
          remember(key, entry, data);
          // Must be registered: unawaited work may be cancelled after the response.
          if (opts.persistent) opts.waitUntil(opts.persistent.put(key, entry, policy.error).catch(() => {}));
          return entry;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, running);
    }
    return running;
  };

  if (cached) {
    // A cached entry that no longer parses (e.g. truncated) is discarded.
    try {
      load(cached.entry, false);
    } catch {
      memory.delete(key);
      cached = undefined;
    }
  }

  if (cached) {
    const age = opts.now() - cached.entry.fetchedAt;
    if (age < policy.fresh) {
      return load(cached.entry, false);
    }
    if (age < policy.swr) {
      opts.waitUntil(refresh().catch(() => {}));
      return load(cached.entry, false);
    }
  }

  try {
    return load(await refresh(), false);
  } catch (error) {
    if (cached && opts.now() - cached.entry.fetchedAt < policy.error) {
      return load(cached.entry, true);
    }
    throw error;
  }
}

/** Persistent tier backed by the Cloudflare Cache API (`caches.default`). */
export function cacheApiStore(cache: Cache, origin: string): PersistentStore {
  const toKey = (key: string) => `${origin}/__swr/${encodeURIComponent(key)}`;
  return {
    async get(key) {
      const response = await cache.match(toKey(key));
      if (!response) return undefined;
      const fetchedAt = Number(response.headers.get('x-fetched-at'));
      const body = await response.text();
      if (!Number.isFinite(fetchedAt) || body === '') return undefined;
      return {
        body,
        fetchedAt,
        etag: response.headers.get('x-upstream-etag') ?? undefined,
      };
    },
    async put(key, entry, ttlMs) {
      const headers = new Headers({
        'content-type': 'application/json',
        'cache-control': `public, max-age=${Math.round(ttlMs / 1000)}`,
        'x-fetched-at': String(entry.fetchedAt),
      });
      if (entry.etag) headers.set('x-upstream-etag', entry.etag);
      await cache.put(toKey(key), new Response(entry.body, { headers }));
    },
  };
}
